import OpenAI from "openai";
import {
    getToolsForRole,
    formatToolsForOpenAI,
    executeToolByName,
    buildUnifiedSystemPrompt
} from "../toolRegistry.js";

export async function processOpenAIRequest({
    message,
    history = [],
    authUser,
    apiKey,
    baseURL,
    modelName,
    isCustomOpenRouter = false,
    isOpenCode = false
}) {
    if (!apiKey) {
        return {
            success: false,
            message: "API key is required for OpenAI/OpenRouter/OpenCode."
        };
    }

    let defaultHeaders;
    if (isCustomOpenRouter) {
        defaultHeaders = {
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Shelter Group HRMS"
        };
    } else if (isOpenCode || (baseURL && baseURL.includes("opencode.ai"))) {
        defaultHeaders = {
            "X-Session-ID": `ses_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            "User-Agent": "opencode/1.0.0"
        };
    }

    const client = new OpenAI({
        apiKey,
        baseURL: baseURL || (isCustomOpenRouter ? "https://openrouter.ai/api/v1" : undefined),
        defaultHeaders
    });

    let targetModel = modelName;
    if (isOpenCode || (baseURL && baseURL.includes("opencode.ai"))) {
        targetModel = (modelName || "big-pickle").toLowerCase().replace(/\s+/g, "-");
    } else if (!targetModel) {
        targetModel = isCustomOpenRouter ? "nvidia/nemotron-3.5-lightning:free" : "gpt-4o-mini";
    }
    const rawTools = getToolsForRole(authUser.role);
    const formattedTools = formatToolsForOpenAI(rawTools);
    const systemPrompt = buildUnifiedSystemPrompt(authUser);

    // Build message thread
    const messages = [
        { role: "system", content: systemPrompt }
    ];

    if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
            if (item.sender === "user" && item.text) {
                messages.push({ role: "user", content: item.text });
            } else if (item.sender === "assistant" && item.text) {
                messages.push({ role: "assistant", content: item.text });
            }
        }
    }

    messages.push({ role: "user", content: message });

    try {
        let turn = 0;
        const maxTurns = 5;

        while (turn < maxTurns) {
            turn++;

            const response = await client.chat.completions.create({
                model: targetModel,
                messages,
                tools: formattedTools.length > 0 ? formattedTools : undefined,
                tool_choice: "auto"
            });

            const choice = response.choices?.[0];
            const assistantMessage = choice?.message;

            if (!assistantMessage) {
                throw new Error("No response message returned by the model.");
            }

            // Append assistant message to thread
            messages.push(assistantMessage);

            const toolCalls = assistantMessage.tool_calls;

            // If the model requested tool calls
            if (toolCalls && toolCalls.length > 0) {
                let pendingConfirmation = null;

                for (const toolCall of toolCalls) {
                    let parsedArgs = {};
                    try {
                        parsedArgs = JSON.parse(toolCall.function?.arguments || "{}");
                    } catch {
                        parsedArgs = {};
                    }

                    const result = await executeToolByName(
                        toolCall.function?.name,
                        parsedArgs,
                        authUser
                    );

                    if (result?.requiresConfirmation) {
                        pendingConfirmation = result;
                    }

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }

                // If a tool requires user confirmation
                if (pendingConfirmation) {
                    const confirmCompletion = await client.chat.completions.create({
                        model: targetModel,
                        messages
                    });

                    return {
                        success: true,
                        message: confirmCompletion.choices?.[0]?.message?.content || "Please review and confirm the action below:",
                        requiresConfirmation: true,
                        confirmation: pendingConfirmation
                    };
                }

                // Continue loop so the model can process tool outputs
                continue;
            }

            // Final text response
            return {
                success: true,
                message: assistantMessage.content || "I have processed your request.",
                requiresConfirmation: false
            };
        }

        return {
            success: true,
            message: "I processed your request, but the query required multiple steps. How else can I help?"
        };

    } catch (error) {
        console.error("OpenAI / OpenRouter Service Error:", error);

        let userFacingError = "Sorry, I encountered an issue processing your request with the AI provider.";

        if (error.status === 401 || error.message?.includes("invalid_api_key") || error.message?.includes("User not found")) {
            userFacingError = "The configured API key is invalid or unauthorized. Please verify your .env settings.";
        } else if (error.status === 429 || error.message?.includes("quota") || error.message?.includes("rate_limit")) {
            userFacingError = "API rate limit or quota exceeded for this model. Please try again shortly or switch models.";
        }

        return {
            success: false,
            message: userFacingError
        };
    }
}

