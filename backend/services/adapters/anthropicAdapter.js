import Anthropic from "@anthropic-ai/sdk";
import {
    getToolsForRole,
    formatToolsForAnthropic,
    executeToolByName,
    buildUnifiedSystemPrompt
} from "../toolRegistry.js";

export async function processAnthropicRequest({
    message,
    history = [],
    authUser,
    apiKey,
    modelName
}) {
    if (!apiKey) {
        return {
            success: false,
            message: "ANTHROPIC_API_KEY is not configured in backend/.env."
        };
    }

    const client = new Anthropic({ apiKey });
    const targetModel = modelName || "claude-3-5-haiku-20241022";
    const rawTools = getToolsForRole(authUser.role);
    const formattedTools = formatToolsForAnthropic(rawTools);
    const systemPrompt = buildUnifiedSystemPrompt(authUser);

    const messages = [];

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

            const response = await client.messages.create({
                model: targetModel,
                max_tokens: 1024,
                system: systemPrompt,
                messages,
                tools: formattedTools.length > 0 ? formattedTools : undefined
            });

            // Add assistant response to messages
            messages.push({ role: "assistant", content: response.content });

            const toolUseBlocks = response.content.filter(block => block.type === "tool_use");

            if (toolUseBlocks.length > 0) {
                const toolResults = [];
                let pendingConfirmation = null;

                for (const toolUse of toolUseBlocks) {
                    const result = await executeToolByName(
                        toolUse.name,
                        toolUse.input || {},
                        authUser
                    );

                    if (result?.requiresConfirmation) {
                        pendingConfirmation = result;
                    }

                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(result)
                    });
                }

                messages.push({
                    role: "user",
                    content: toolResults
                });

                if (pendingConfirmation) {
                    const followUp = await client.messages.create({
                        model: targetModel,
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages
                    });

                    const textBlock = followUp.content.find(b => b.type === "text");
                    return {
                        success: true,
                        message: textBlock?.text || "Please review and confirm the action below:",
                        requiresConfirmation: true,
                        confirmation: pendingConfirmation
                    };
                }

                continue;
            }

            const textBlock = response.content.find(b => b.type === "text");
            return {
                success: true,
                message: textBlock?.text || "I have processed your request.",
                requiresConfirmation: false
            };
        }

        return {
            success: true,
            message: "I processed your request, but the query required multiple steps. How else can I help?"
        };

    } catch (error) {
        console.error("Anthropic Service Error:", error);

        let userFacingError = "Sorry, I encountered an issue processing your request with Claude.";

        if (error.status === 401) {
            userFacingError = "The configured Anthropic API key appears to be invalid. Please verify your settings.";
        } else if (error.status === 429) {
            userFacingError = "Anthropic rate limit exceeded. Please try again shortly.";
        }

        return {
            success: false,
            message: userFacingError
        };
    }
}

