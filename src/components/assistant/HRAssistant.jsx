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
import "./HRAssistant.css";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let messageCounter = 0;
function createMessageId(prefix = "msg") {
    messageCounter += 1;
    return `${prefix}-${messageCounter}`;
}

function getFormattedTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Simple markdown formatter for messages (bold, bullet points, linebreaks)
function renderFormattedMessage(text) {
    if (!text) return null;

    const lines = text.split("\n");
    return lines.map((line, idx) => {
        // Bullet list
        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            const bulletText = line.trim().slice(2);
            return (
                <div key={idx} className="assistant-bullet">
                    <span className="bullet-dot">•</span>
                    <span>{renderInlineFormatting(bulletText)}</span>
                </div>
            );
        }

        // Blank line
        if (!line.trim()) {
            return <div key={idx} className="assistant-line-break" />;
        }

        return <div key={idx} className="assistant-paragraph">{renderInlineFormatting(line)}</div>;
    });
}

function renderInlineFormatting(text) {
    // Handle **bold**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return part;
    });
}

function getInitialUserSession() {
    const hrSession = sessionStorage.getItem("loggedInHR");
    const employeeSession = sessionStorage.getItem("loggedInEmployee");

    if (hrSession) {
        try {
            return { ...JSON.parse(hrSession), role: "hr" };
        } catch {
            return null;
        }
    }
    if (employeeSession) {
        try {
            return { ...JSON.parse(employeeSession), role: "employee" };
        } catch {
            return null;
        }
    }
    return null;
}

function buildWelcomeMessage(currentUser) {
    if (!currentUser) return null;
    const isHR = currentUser.role === "hr";
    return {
        id: createMessageId("welcome"),
        sender: "assistant",
        text: `👋 Hello **${currentUser.name || "there"}**! I am your **Shelter HR Assistant**.\n\n` +
            (isHR
                ? "I can assist you with active employee counts, attendance summaries, pending leave requests, candidate job openings, and more."
                : "I can help you check your leave balance, recent attendance, profile records, and submit leave requests."),
        timestamp: getFormattedTime()
    };
}

export default function HRAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [user, setUser] = useState(getInitialUserSession);
    const [messages, setMessages] = useState(() => {
        const initialUser = getInitialUserSession();
        const welcome = buildWelcomeMessage(initialUser);
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

    // 1. Sync User Session
    useEffect(() => {
        const checkUserSession = () => {
            const currentSession = getInitialUserSession();
            setUser(currentSession);
        };

        window.addEventListener("storage", checkUserSession);
        return () => window.removeEventListener("storage", checkUserSession);
    }, []);

    // 2. Auto-scroll to bottom of chat
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isLoading, isOpen, scrollToBottom]);

    // 3. Text-To-Speech (SpeechSynthesis)
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

    // 4. Send User Message to Backend
    const sendMessage = useCallback(async (textToSend) => {
        const text = (textToSend || inputValue).trim();
        if (!text || isLoading || !user) return;

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
                    history: [...messages, userMsg].slice(-6).map(m => ({ sender: m.sender, text: m.text })),
                    employee_id: user.employee_id
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
    }, [inputValue, isLoading, user, messages, speakResponse]);

    // 5. Web Speech API Setup (Speech Recognition)
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
            if (event.error === "not-allowed") {
                setVoiceError("Microphone permission was denied. Please allow microphone access in your browser.");
            } else if (event.error !== "no-speech") {
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

    // 6. Handle Confirmation Actions (Confirm / Cancel)
    const handleConfirmAction = async (msgId, confirmation) => {
        if (!user || actionLoading) return;

        setActionLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/assistant`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employee_id: user.employee_id,
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

    // 7. Clear Chat History
    const clearChat = () => {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setMessages([]);
    };

    // Quick suggestion pills based on user role
    const suggestions = user?.role === "hr" ? [
        "Today's attendance overview",
        "How many active employees are there?",
        "Show pending leave requests",
        "What job openings are active?"
    ] : [
        "How many leaves do I have?",
        "Show my recent attendance",
        "Show my leave requests",
        "View my profile details"
    ];

    if (!user) return null;

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
                    title="Open Shelter HR Assistant"
                    aria-label="Open Shelter HR Assistant"
                >
                    <div className="trigger-icon-pulse">
                        <Bot size={24} className="bot-icon" />
                        <Sparkles size={13} className="sparkle-badge" />
                    </div>
                    <span className="trigger-label">HR Assistant</span>
                </button>
            )}

            {/* Assistant Chat Window */}
            {isOpen && (
                <div className="shelter-assistant-window">
                    {/* Header */}
                    <div className="assistant-header">
                        <div className="header-left">
                            <div className="header-avatar">
                                <Bot size={20} />
                            </div>
                            <div className="header-info">
                                <h3>Shelter HR Assistant</h3>
                                <div className="header-status">
                                    <span className="status-dot online"></span>
                                    <small>{user.role === "hr" ? "HR Admin Mode" : "Employee Mode"}</small>
                                </div>
                            </div>
                        </div>

                        <div className="header-actions">
                            {/* Voice Output Toggle */}
                            <button
                                className={`header-btn ${voiceOutputEnabled ? "active" : ""}`}
                                onClick={() => {
                                    if (voiceOutputEnabled && window.speechSynthesis) {
                                        window.speechSynthesis.cancel();
                                    }
                                    setVoiceOutputEnabled(prev => !prev);
                                }}
                                title={voiceOutputEnabled ? "Mute Voice Output" : "Enable Voice Output"}
                                aria-label="Toggle Voice Output"
                            >
                                {voiceOutputEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                            </button>

                            {/* Clear History */}
                            <button
                                className="header-btn"
                                onClick={clearChat}
                                title="Clear conversation"
                                aria-label="Clear conversation"
                            >
                                <RotateCcw size={16} />
                            </button>

                            {/* Close Window */}
                            <button
                                className="header-btn close-btn"
                                onClick={() => {
                                    if (window.speechSynthesis) {
                                        window.speechSynthesis.cancel();
                                    }
                                    setIsOpen(false);
                                }}
                                title="Close Assistant"
                                aria-label="Close Assistant"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

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
