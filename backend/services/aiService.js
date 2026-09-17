import { processGeminiRequest } from "./adapters/geminiAdapter.js";
import { processOpenAIRequest } from "./adapters/openaiAdapter.js";
import { processAnthropicRequest } from "./adapters/anthropicAdapter.js";

/**
 * Detects the active AI provider based on environment configuration or API key signature.
 */
export function detectProvider() {
    const explicitProvider = (process.env.AI_PROVIDER || "").trim().toLowerCase();
    const universalKey = process.env.AI_API_KEY || "";
    const openrouterKey = process.env.OPENROUTER_API_KEY || "";
    const opencodeKey = process.env.OPENCODE_API_KEY || "";
    const openaiKey = process.env.OPENAI_API_KEY || "";
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    const geminiKey = process.env.GEMINI_API_KEY || "";

    // 1. Explicit selection if specified
    if (explicitProvider && explicitProvider !== "auto") {
        if (explicitProvider === "opencode") {
            return {
                provider: "opencode",
                apiKey: opencodeKey || universalKey,
                model: (process.env.AI_MODEL || "big-pickle").toLowerCase().replace(/\s+/g, "-"),
                baseURL: process.env.AI_BASE_URL || "https://opencode.ai/zen/v1"
            };
        }
        if (explicitProvider === "openrouter") {
            return {
                provider: "openrouter",
                apiKey: openrouterKey || universalKey,
                model: process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning:free",
                baseURL: process.env.AI_BASE_URL || "https://openrouter.ai/api/v1"
            };
        }
        if (explicitProvider === "openai") {
            return {
                provider: "openai",
                apiKey: openaiKey || universalKey,
                model: process.env.AI_MODEL || "gpt-4o-mini",
                baseURL: process.env.AI_BASE_URL
            };
        }
        if (explicitProvider === "anthropic") {
            return {
                provider: "anthropic",
                apiKey: anthropicKey || universalKey,
                model: process.env.AI_MODEL || "claude-3-5-haiku-20241022"
            };
        }
        if (explicitProvider === "gemini") {
            return {
                provider: "gemini",
                apiKey: geminiKey || universalKey,
                model: process.env.AI_MODEL
            };
        }
    }

    // 2. Auto-detection based on API key prefix or distinct env variables

    // OpenRouter (keys start with sk-or-v1- or OPENROUTER_API_KEY)
    if (openrouterKey || universalKey.startsWith("sk-or-v1-")) {
        return {
            provider: "openrouter",
            apiKey: openrouterKey || universalKey,
            model: process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning:free",
            baseURL: process.env.AI_BASE_URL || "https://openrouter.ai/api/v1"
        };
    }

    // Anthropic (keys start with sk-ant- or ANTHROPIC_API_KEY)
    if (anthropicKey || universalKey.startsWith("sk-ant-")) {
        return {
            provider: "anthropic",
            apiKey: anthropicKey || universalKey,
            model: process.env.AI_MODEL || "claude-3-5-haiku-20241022"
        };
    }

    // OpenCode (keys with OPENCODE_API_KEY or model contains pickle or opencode)
    if (opencodeKey || (process.env.AI_MODEL && (process.env.AI_MODEL.toLowerCase().includes("pickle") || process.env.AI_MODEL.toLowerCase().includes("opencode")))) {
        return {
            provider: "opencode",
            apiKey: opencodeKey || universalKey,
            model: (process.env.AI_MODEL || "big-pickle").toLowerCase().replace(/\s+/g, "-"),
            baseURL: process.env.AI_BASE_URL || "https://opencode.ai/zen/v1"
        };
    }

    // OpenAI (standard keys start with sk- or OPENAI_API_KEY)
    if (openaiKey || (universalKey.startsWith("sk-") && !universalKey.startsWith("sk-or-v1-") && !universalKey.startsWith("sk-ant-"))) {
        return {
            provider: "openai",
            apiKey: openaiKey || universalKey,
            model: process.env.AI_MODEL || "gpt-4o-mini",
            baseURL: process.env.AI_BASE_URL
        };
    }

    // Google Gemini (keys start with AIzaSy or GEMINI_API_KEY)
    if (geminiKey || universalKey.startsWith("AIzaSy")) {
        return {
            provider: "gemini",
            apiKey: geminiKey || universalKey,
            model: process.env.AI_MODEL
        };
    }

    // Fallback: Check if any universal key was provided
    if (universalKey) {
        return {
            provider: "openai",
            apiKey: universalKey,
            model: process.env.AI_MODEL || "gpt-4o-mini",
            baseURL: process.env.AI_BASE_URL
        };
    }

    return null;
}

/**
 * Universal Assistant Message Processor.
 * Dispatches to the active provider (Gemini, OpenRouter, OpenAI, or Anthropic).
 */
export async function processUnifiedAIMessage({ message, history = [], authUser }) {
    const active = detectProvider();

    if (!active || !active.apiKey) {
        return {
            success: false,
            message: "No AI API key configured. Please set GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in backend/.env."
        };
    }

    // Dispatch to provider adapter
    if (active.provider === "opencode") {
        return await processOpenAIRequest({
            message,
            history,
            authUser,
            apiKey: active.apiKey,
            baseURL: active.baseURL || "https://opencode.ai/zen/v1",
            modelName: active.model || "big-pickle",
            isOpenCode: true
        });
    }

    if (active.provider === "openrouter") {
        return await processOpenAIRequest({
            message,
            history,
            authUser,
            apiKey: active.apiKey,
            baseURL: active.baseURL,
            modelName: active.model,
            isCustomOpenRouter: true
        });
    }

    if (active.provider === "openai") {
        return await processOpenAIRequest({
            message,
            history,
            authUser,
            apiKey: active.apiKey,
            baseURL: active.baseURL,
            modelName: active.model,
            isCustomOpenRouter: false
        });
    }

    if (active.provider === "anthropic") {
        return await processAnthropicRequest({
            message,
            history,
            authUser,
            apiKey: active.apiKey,
            modelName: active.model
        });
    }

    if (active.provider === "gemini") {
        return await processGeminiRequest({
            message,
            history,
            authUser,
            apiKey: active.apiKey,
            modelName: active.model
        });
    }

    return {
        success: false,
        message: `Unknown AI provider: '${active.provider}'.`
    };
}

