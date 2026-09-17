import { GoogleGenAI } from "@google/genai";
import {
    getToolsForRole,
    formatToolsForGemini,
    executeToolByName,
    buildUnifiedSystemPrompt
} from "../toolRegistry.js";

const DEFAULT_GEMINI_MODELS = [
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash"
];

export async function processGeminiRequest({
    message,
    history = [],
    authUser,
    apiKey,
    modelName
}) {
    if (!apiKey) {
        return {
            success: false,
            message: "GEMINI_API_KEY is not configured in backend/.env. Please add your key to enable the assistant."
        };
    }

    const ai = new GoogleGenAI({ apiKey });
    const rawTools = getToolsForRole(authUser.role);
    const geminiTools = formatToolsForGemini(rawTools);
    const systemInstruction = buildUnifiedSystemPrompt(authUser);

    // Format conversation history for Gemini API
    const initialContents = [];

    if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
            if (item.sender === "user" && item.text) {
                initialContents.push({
                    role: "user",
                    parts: [{ text: item.text }]
                });
            } else if (item.sender === "assistant" && item.text) {
                initialContents.push({
                    role: "model",
                    parts: [{ text: item.text }]
                });
            }
        }
    }

    initialContents.push({
        role: "user",
        parts: [{ text: message }]
    });

    const candidateModels = modelName
        ? [modelName, ...DEFAULT_GEMINI_MODELS.filter(m => m !== modelName)]
        : DEFAULT_GEMINI_MODELS;

    let lastError = null;

    for (const targetModel of candidateModels) {
        const contents = JSON.parse(JSON.stringify(initialContents));

        try {
            let turn = 0;
            const maxTurns = 5;

            while (turn < maxTurns) {
                turn++;

                const response = await ai.models.generateContent({
                    model: targetModel,
                    contents,
                    config: {
                        systemInstruction,
                        tools: geminiTools
                    }
                });

                const candidate = response.candidates?.[0];
                const functionCalls = response.functionCalls || 
                    candidate?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);

                if (functionCalls && functionCalls.length > 0) {
                    contents.push(candidate.content);

                    const responseParts = [];
                    let pendingConfirmation = null;

                    for (const call of functionCalls) {
                        const result = await executeToolByName(call.name, call.args || {}, authUser);

                        if (result?.requiresConfirmation) {
                            pendingConfirmation = result;
                        }

                        responseParts.push({
                            functionResponse: {
                                name: call.name,
                                response: { output: result }
                            }
                        });
                    }

                    contents.push({
                        role: "user",
                        parts: responseParts
                    });

                    if (pendingConfirmation) {
                        const followUp = await ai.models.generateContent({
                            model: targetModel,
                            contents,
                            config: {
                                systemInstruction
                            }
                        });

                        return {
                            success: true,
                            message: followUp.text || "Please review and confirm the action below:",
                            requiresConfirmation: true,
                            confirmation: pendingConfirmation
                        };
                    }

                    continue;
                }

                return {
                    success: true,
                    message: response.text || "I processed your request.",
                    requiresConfirmation: false
                };
            }

            return {
                success: true,
                message: "I processed your request, but the query required multiple steps. How else can I help?"
            };

        } catch (error) {
            lastError = error;
            const isRetryable = 
                error.status === 429 || 
                error.status === 404 || 
                error.status === 503 ||
                error.status === 500 ||
                error.message?.includes("quota") || 
                error.message?.includes("RESOURCE_EXHAUSTED") ||
                error.message?.includes("no longer available") ||
                error.message?.includes("high demand") ||
                error.message?.includes("UNAVAILABLE");

            if (isRetryable && candidateModels.indexOf(targetModel) < candidateModels.length - 1) {
                console.warn(`[GeminiAdapter] Model '${targetModel}' hit error (${error.status || error.message?.slice(0, 60)}). Trying fallback model...`);
                continue;
            }
            break;
        }
    }

    console.error("Gemini Adapter Error:", lastError);

    let userFacingError = "Sorry, I encountered an issue processing your request with Gemini.";

    if (lastError?.message?.includes("API_KEY_INVALID") || lastError?.message?.includes("API key not valid")) {
        userFacingError = "The configured Gemini API key appears to be invalid. Please check your backend/.env configuration.";
    } else if (lastError?.message?.includes("quota") || lastError?.message?.includes("RESOURCE_EXHAUSTED")) {
        userFacingError = "Gemini API quota has been reached. Please try again shortly.";
    }

    return {
        success: false,
        message: userFacingError
    };
}

