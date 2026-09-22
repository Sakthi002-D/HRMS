import { useState, useEffect, useRef, useCallback } from "react";
import {
    Bot,
    Sparkles,
    Send,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    X,
    RotateCcw,
    AlertCircle,
    CheckCircle2,
    XCircle
} from "lucide-react";
import API_URL from "../../config/api";
import "./HRAssistant.css";

const API_BASE_URL = API_URL;

let messageCounter = 0;
function createMessageId(prefix = "msg") {
    messageCounter += 1;
    return `${prefix}-${Date.now()}-${messageCounter}`;
}

function getFormattedTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Completely purge any legacy or temporary chat storage from browser memory.
 * Ensures zero persistent chat storage in localStorage/sessionStorage.
 */
export function purgeAllChatStorage() {
    try {
        const legacyKeys = [
            "chatHistory",
            "chat_history",
            "messages",
            "conversation",
            "chatMessages",
            "chat_messages",
            "conversationHistory",
            "conversation_history",
            "conversationId",
            "conversation_id",
            "shelter_chat_history",
            "shelter_assistant_history"
        ];
        legacyKeys.forEach(k => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
        });

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.startsWith("shelter_ai_chat_") || key.startsWith("chat:"))) {
                localStorage.removeItem(key);
            }
        }
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && (key.startsWith("shelter_ai_chat_") || key.startsWith("chat:"))) {
                sessionStorage.removeItem(key);
            }
        }
    } catch {
        // Ignore storage access errors
    }
}

// Simple markdown formatter for messages (bold, bullet points, linebreaks)
function renderFormattedMessage(text) {
    if (!text) return null;

    const lines = text.split("\n");
    return lines.map((line, idx) => {
        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            const bulletText = line.trim().slice(2);
            return (
                <div key={idx} className="assistant-bullet">
                    <span className="bullet-dot">•</span>
                    <span>{renderInlineFormatting(bulletText)}</span>
                </div>
            );
        }

        if (!line.trim()) {
            return <div key={idx} className="assistant-line-break" />;
        }

        return <div key={idx} className="assistant-paragraph">{renderInlineFormatting(line)}</div>;
    });
}

function renderInlineFormatting(text) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return part;
    });
}

function buildWelcomeMessage(currentUser, currentRole) {
    if (!currentUser) return null;
    const isHR = currentRole === "hr" || currentUser.role === "hr";
    const displayName = currentUser.name || (isHR ? "HR Administrator" : "Employee");

    return {
        id: createMessageId("welcome"),
        sender: "assistant",
        text: `👋 Hello **${displayName}**! I am your **Shelter Assistant**.\n\n` +
            (isHR
                ? "I can assist you with company employee directories, department headcount, daily attendance metrics, company payroll, active recruitment openings, and pending leave or document requests."
                : "I can assist you with your leave balance, recent attendance logs, salary and payslips, document records, formal request statuses, or applying for leave."),
        timestamp: getFormattedTime()
    };
}

export default function HRAssistant({ role: propRole, user: propUser }) {
    const activeRole = (propRole || propUser?.role || (sessionStorage.getItem("loggedInHR") ? "hr" : "employee")).toLowerCase();

    const activeUser = propUser || (() => {
        try {
            if (activeRole === "hr") {
                const raw = sessionStorage.getItem("loggedInHR");
                return raw ? JSON.parse(raw) : null;
            }
            const raw = sessionStorage.getItem("loggedInEmployee");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    })();

    const activeUserId = activeUser?.employee_id || activeUser?.id || null;

    // Visibility Check: Never render if no authenticated user exists
    if (!activeUser || !activeUserId) {
        return null;
    }

    const isHR = activeRole === "hr";
    const assistantTitle = "Shelter Assistant";
    const assistantBadge = isHR ? "HR Mode" : "Employee Mode";

    const [isOpen, setIsOpen] = useState(false);

    // Purely in-memory React state: No persistent storage used.
    // Starts fresh on every mount, login, or page refresh.
    const [messages, setMessages] = useState(() => {
        purgeAllChatStorage();
        const welcome = buildWelcomeMessage(activeUser, activeRole);
        return welcome ? [welcome] : [];
    });

    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [speechSupported] = useState(() => {
        return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    });
    const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [voiceError, setVoiceError] = useState(null);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const inputRef = useRef(null);

    // Lifecycle cleanup on logout / unmount
    useEffect(() => {
        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                } catch {
                    // Ignore
                }
            }
        };
    }, []);

    // Auto-scroll to bottom of chat
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isLoading, isOpen, scrollToBottom]);

    // Text-To-Speech (SpeechSynthesis)
    const speakResponse = useCallback((text) => {
        if (!voiceOutputEnabled || !window.speechSynthesis) return;

        window.speechSynthesis.cancel();

        const plainText = text
            .replace(/\*\*/g, "")
            .replace(/[•\-*]/g, "")
            .replace(/\n+/g, " ")
            .trim();

        if (!plainText) return;

        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang === "en-IN") ||
            voices.find(v => v.lang.startsWith("en-")) ||
            voices[0];

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        window.speechSynthesis.speak(utterance);
    }, [voiceOutputEnabled]);

    // Send User Message to Backend (in-memory context only during active session)
    const sendMessage = useCallback(async (textToSend) => {
        const text = (textToSend || inputValue).trim();
        if (!text || isLoading || !activeUserId) return;

        const userMsg = {
            id: createMessageId("usr"),
            sender: "user",
            text: text,
            timestamp: getFormattedTime()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue("");
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/assistant`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    // Send previous turns from current in-memory thread only
                    history: [...messages, userMsg].slice(-6).map(m => ({ sender: m.sender, text: m.text })),
                    employee_id: activeUserId
                })
            });

            const data = await response.json();

            const assistantMsg = {
                id: createMessageId("ast"),
                sender: "assistant",
                text: data.message || (data.success ? "Done." : "Sorry, I couldn't complete that request."),
                requiresConfirmation: data.requiresConfirmation || false,
                confirmation: data.confirmation || null,
                timestamp: getFormattedTime()
            };

            setMessages(prev => [...prev, assistantMsg]);

            if (assistantMsg.text) {
                speakResponse(assistantMsg.text);
            }

        } catch (error) {
            console.error("Assistant communication error:", error);
            const errorMsg = {
                id: createMessageId("err"),
                sender: "assistant",
                text: "⚠️ I could not reach the HRMS server. Please verify your connection and ensure the backend is running.",
                timestamp: getFormattedTime()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    }, [inputValue, isLoading, activeUserId, messages, speakResponse]);

    // Web Speech API Setup (Speech Recognition)
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-IN";

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceError(null);
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
                setInputValue(transcript);
                sendMessage(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.warn("Speech recognition error:", event.error);
            setIsListening(false);
            if (event.error === "aborted" || event.error === "no-speech") {
                // Normal user cancellation or silence - do not display an error banner
                return;
            }
            if (event.error === "not-allowed" || event.error === "permission-denied") {
                setVoiceError("Microphone permission was denied. Please allow microphone access in your browser.");
            } else if (event.error === "network") {
                setVoiceError("Network connection issue during speech recognition. Please check your connection.");
            } else {
                setVoiceError(`Voice recognition error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                } catch {
                    // Ignore
                }
            }
        };
    }, [sendMessage]);

    // Toggle speech recognition
    const toggleSpeechRecognition = () => {
        if (!speechSupported) {
            setVoiceError("Speech recognition is not supported in this browser. Please try Chrome or Edge.");
            return;
        }

        if (isListening) {
            try {
                recognitionRef.current?.stop();
            } catch {
                // Ignore
            }
            setIsListening(false);
            setVoiceError(null);
        } else {
            setVoiceError(null);
            try {
                recognitionRef.current?.start();
            } catch (err) {
                console.error("Failed to start speech recognition:", err);
                setIsListening(false);
            }
        }
    };

    // Handle Confirmation Actions (Confirm / Cancel)
    const handleConfirmAction = async (msgId, confirmation) => {
        if (!activeUserId || actionLoading) return;

        setActionLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/assistant`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employee_id: activeUserId,
                    actionConfirmation: {
                        actionType: confirmation.actionType,
                        payload: confirmation.payload
                    }
                })
            });

            const data = await response.json();

            setMessages(prev => prev.map(m => {
                if (m.id === msgId) {
                    return {
                        ...m,
                        requiresConfirmation: false,
                        resolvedText: data.success ? "✅ Confirmed and completed." : "❌ Action failed."
                    };
                }
                return m;
            }));

            const statusMsg = {
                id: createMessageId("stat"),
                sender: "assistant",
                text: data.message || (data.success ? "Operation completed successfully." : "Failed to execute operation."),
                timestamp: getFormattedTime()
            };
            setMessages(prev => [...prev, statusMsg]);
            speakResponse(statusMsg.text);

        } catch (err) {
            console.error("Action confirmation error:", err);
            alert("Error confirming action. Please try again.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelAction = (msgId) => {
        setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
                return {
                    ...m,
                    requiresConfirmation: false,
                    resolvedText: "🚫 Action cancelled by user."
                };
            }
            return m;
        }));

        const cancelMsg = {
            id: createMessageId("cnc"),
            sender: "assistant",
            text: "The operation has been cancelled. No changes were made.",
            timestamp: getFormattedTime()
        };
        setMessages(prev => [...prev, cancelMsg]);
    };

    // Clear Chat History strictly within active session
    const clearChat = () => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        const welcome = buildWelcomeMessage(activeUser, activeRole);
        setMessages(welcome ? [welcome] : []);
    };

    // Role-specific suggestions
    const suggestions = isHR ? [
        "Today's attendance overview",
        "How many active employees are there?",
        "Show pending leave requests",
        "Show company payroll overview"
    ] : [
        "How many leaves do I have?",
        "Show my latest salary & payslip",
        "Show my recent attendance",
        "What is my attendance summary?"
    ];

    return (
        <div className="shelter-assistant-container">
            {/* Floating Trigger Button */}
            {!isOpen && (
                <button
                    className="shelter-assistant-trigger"
                    onClick={() => {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 150);
                    }}
                    title={`Open ${assistantTitle}`}
                    aria-label={`Open ${assistantTitle}`}
                >
                    <div className="trigger-icon-pulse">
                        <Bot size={24} className="bot-icon" />
                        <Sparkles size={13} className="sparkle-badge" />
                    </div>
                    <span className="trigger-label">{assistantTitle}</span>
                </button>
            )}

            {/* Assistant Chat Window */}
            {isOpen && (
                <div className="shelter-assistant-window">
                    {/* Header */}
                    <header className="assistant-header">
                        <div className="assistant-header-left">
                            <div className="assistant-header-avatar">
                                <Bot size={20} />
                            </div>
                            <div className="assistant-header-info">
                                <h3 className="assistant-header-title">{assistantTitle}</h3>
                                <div className="assistant-header-status">
                                    <span className="assistant-status-dot online"></span>
                                    <small>{assistantBadge}</small>
                                </div>
                            </div>
                        </div>

                        {/* Dedicated Horizontal Action Group (Mute, Refresh, Close) */}
                        <div className="assistant-header-actions">
                            {/* 1. Mute / Speaker Toggle */}
                            <button
                                type="button"
                                className={`assistant-header-action assistant-header-action--voice ${voiceOutputEnabled ? "is-active" : ""}`}
                                onClick={() => {
                                    if (voiceOutputEnabled && window.speechSynthesis) {
                                        window.speechSynthesis.cancel();
                                    }
                                    setVoiceOutputEnabled(prev => !prev);
                                }}
                                title={voiceOutputEnabled ? "Mute Voice Output" : "Enable Voice Output"}
                                aria-label="Toggle Voice Output"
                            >
                                {voiceOutputEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                            </button>

                            {/* 2. Refresh / Clear Conversation */}
                            <button
                                type="button"
                                className="assistant-header-action assistant-header-action--refresh"
                                onClick={clearChat}
                                title="Clear conversation"
                                aria-label="Clear conversation"
                            >
                                <RotateCcw size={16} />
                            </button>

                            {/* 3. Close Assistant Window */}
                            <button
                                type="button"
                                className="assistant-header-action assistant-header-action--close"
                                onClick={() => {
                                    if (window.speechSynthesis) {
                                        window.speechSynthesis.cancel();
                                    }
                                    setIsOpen(false);
                                }}
                                title="Close Shelter Assistant"
                                aria-label="Close Shelter Assistant"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </header>

                    {/* Notification error banner if microphone issue */}
                    {voiceError && (
                        <div className="assistant-alert-banner">
                            <AlertCircle size={15} />
                            <span>{voiceError}</span>
                            <button onClick={() => setVoiceError(null)}><X size={14} /></button>
                        </div>
                    )}

                    {/* Messages Body */}
                    <div className="assistant-messages-body">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`assistant-message-row ${msg.sender}`}>
                                {msg.sender === "assistant" && (
                                    <div className="message-avatar">
                                        <Bot size={16} />
                                    </div>
                                )}

                                <div className="message-bubble-wrapper">
                                    <div className="message-bubble">
                                        {renderFormattedMessage(msg.text)}

                                        {/* Confirmation Card if mutation requested */}
                                        {msg.requiresConfirmation && msg.confirmation && (
                                            <div className="action-confirmation-card">
                                                <div className="card-header">
                                                    <AlertCircle size={17} className="card-alert-icon" />
                                                    <strong>{msg.confirmation.title || "Confirmation Required"}</strong>
                                                </div>
                                                <p className="card-summary">{msg.confirmation.summary}</p>
                                                
                                                <div className="card-actions">
                                                    <button
                                                        className="card-btn-cancel"
                                                        onClick={() => handleCancelAction(msg.id)}
                                                        disabled={actionLoading}
                                                    >
                                                        <XCircle size={15} />
                                                        <span>Cancel</span>
                                                    </button>
                                                    <button
                                                        className="card-btn-confirm"
                                                        onClick={() => handleConfirmAction(msg.id, msg.confirmation)}
                                                        disabled={actionLoading}
                                                    >
                                                        <CheckCircle2 size={15} />
                                                        <span>{actionLoading ? "Submitting..." : "Confirm & Submit"}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* If action was previously resolved */}
                                        {msg.resolvedText && (
                                            <div className="card-resolved-status">
                                                {msg.resolvedText}
                                            </div>
                                        )}
                                    </div>
                                    <span className="message-time">{msg.timestamp}</span>
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="assistant-message-row assistant">
                                <div className="message-avatar">
                                    <Bot size={16} />
                                </div>
                                <div className="message-bubble loading-bubble">
                                    <div className="typing-dots">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Suggestion Pills */}
                    {messages.length <= 3 && !isLoading && (
                        <div className="assistant-suggestions">
                            <span className="suggestions-label">Suggested prompts:</span>
                            <div className="suggestions-scroll">
                                {suggestions.map((sug, index) => (
                                    <button
                                        key={index}
                                        className="suggestion-pill"
                                        onClick={() => sendMessage(sug)}
                                    >
                                        {sug}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Voice Listening Banner */}
                    {isListening && (
                        <div className="listening-pulse-banner">
                            <span className="pulse-ring"></span>
                            <Mic size={16} className="mic-active-icon" />
                            <span>Listening... Speak your query clearly</span>
                            <button
                                className="stop-listening-btn"
                                onClick={toggleSpeechRecognition}
                            >
                                Stop
                            </button>
                        </div>
                    )}

                    {/* Input Footer */}
                    <form
                        className="assistant-input-footer"
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage();
                        }}
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            className="assistant-text-input"
                            placeholder={isListening ? "Listening to your voice..." : "Ask Shelter Assistant or use 🎤..."}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            disabled={isLoading}
                        />

                        {/* Voice Input Mic Button */}
                        <button
                            type="button"
                            className={`mic-btn ${isListening ? "recording" : ""}`}
                            onClick={toggleSpeechRecognition}
                            title={isListening ? "Stop listening" : "Click to speak (Web Speech)"}
                            aria-label="Voice input"
                        >
                            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        {/* Send Button */}
                        <button
                            type="submit"
                            className="send-btn"
                            disabled={!inputValue.trim() || isLoading}
                            title="Send message"
                            aria-label="Send message"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}

