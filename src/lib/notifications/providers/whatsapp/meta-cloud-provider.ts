// /**
//  * Official Meta WhatsApp Cloud API provider.
//  * Env:
//  *   WHATSAPP_PROVIDER=meta
//  *   WHATSAPP_ACCESS_TOKEN=
//  *   WHATSAPP_PHONE_NUMBER_ID=
//  *   WHATSAPP_BUSINESS_ACCOUNT_ID= (optional)
//  *   WHATSAPP_API_VERSION=v23.0 (optional)
//  *   WHATSAPP_TEMPLATE_NAME=appointment_confirmation (optional but recommended)
//  *   WHATSAPP_TEMPLATE_LANG=en_US (or en)
//  *
//  * Graph: POST https://graph.facebook.com/{version}/{PHONE_NUMBER_ID}/messages
//  * Auth: Bearer ACCESS_TOKEN
//  *
//  * Automatic booking notifications use template first, then free-form text
//  * fallback when auth succeeded and the failure is template/language related
//  * (not OAuth / code 190).
//  */

// import type { WhatsAppProvider } from "@/lib/notifications/core/interfaces";
// import type { NotificationProviderId } from "@/lib/notifications/core/types";
// import { normalizeWhatsAppDigits } from "@/lib/notifications/providers/whatsapp/click-to-chat-provider";

// // ---------------------------------------------------------------------------
// // Environment helpers
// // ---------------------------------------------------------------------------

// const ENV_DEFAULTS = {
//   WHATSAPP_PROVIDER: "meta",
//   WHATSAPP_API_VERSION: "v23.0",
//   WHATSAPP_TEMPLATE_LANG: "en_US",
// } as const;

// /**
//  * Read and trim an environment variable.
//  * Collapses internal whitespace (common when pasting multi-line secrets).
//  */
// function env(key: string, fallback = ""): string {
//   const raw = process.env[key];
//   if (raw === undefined || raw === null) {
//     return fallback.trim();
//   }
//   // Collapse all whitespace (including newlines) then outer-trim
//   return String(raw).replace(/\s+/g, " ").trim() || fallback.trim();
// }

// /** Access token: strip ALL whitespace (tokens must be continuous). */
// function metaAccessToken(): string {
//   return env("WHATSAPP_ACCESS_TOKEN", "").replace(/\s+/g, "");
// }

// function metaPhoneNumberId(): string {
//   return env("WHATSAPP_PHONE_NUMBER_ID", "").replace(/\s+/g, "");
// }

// function metaApiVersion(): string {
//   return env("WHATSAPP_API_VERSION", ENV_DEFAULTS.WHATSAPP_API_VERSION);
// }

// function metaTemplateName(): string {
//   return env("WHATSAPP_TEMPLATE_NAME", "");
// }

// function metaTemplateLang(): string {
//   return env(
//     "WHATSAPP_TEMPLATE_LANG",
//     ENV_DEFAULTS.WHATSAPP_TEMPLATE_LANG
//   );
// }

// function metaProviderSetting(): string {
//   return env(
//     "WHATSAPP_PROVIDER",
//     ENV_DEFAULTS.WHATSAPP_PROVIDER
//   ).toLowerCase();
// }

// function metaBusinessAccountId(): string {
//   return env("WHATSAPP_BUSINESS_ACCOUNT_ID", "").replace(/\s+/g, "");
// }

// // ---------------------------------------------------------------------------
// // Token / auth diagnostics (never log full token)
// // ---------------------------------------------------------------------------

// type TokenDiagnostics = {
//   tokenLoaded: boolean;
//   tokenLength: number;
//   tokenPrefix: string;
//   tokenLooksLikeMeta: boolean;
// };

// function getTokenDiagnostics(token: string): TokenDiagnostics {
//   const tokenLoaded = Boolean(token && token.length > 0);
//   const tokenLength = token.length;
//   const tokenPrefix = tokenLoaded ? token.slice(0, 6) : "";
//   const tokenLooksLikeMeta = token.startsWith("EAA");
//   return { tokenLoaded, tokenLength, tokenPrefix, tokenLooksLikeMeta };
// }

// function logTokenWarningIfNeeded(diag: TokenDiagnostics): void {
//   if (!diag.tokenLoaded) {
//     console.warn(
//       JSON.stringify({
//         type: "whatsapp_meta_auth_diagnostic",
//         level: "warn",
//         message: "WHATSAPP_ACCESS_TOKEN is missing or empty",
//         tokenLoaded: false,
//         tokenLength: 0,
//         tokenPrefix: "",
//         timestamp: new Date().toISOString(),
//       })
//     );
//     return;
//   }
//   if (diag.tokenLength <= 40) {
//     console.warn(
//       JSON.stringify({
//         type: "whatsapp_meta_auth_diagnostic",
//         level: "warn",
//         message: "WHATSAPP_ACCESS_TOKEN length is unusually short",
//         tokenLoaded: true,
//         tokenLength: diag.tokenLength,
//         tokenPrefix: diag.tokenPrefix,
//         timestamp: new Date().toISOString(),
//       })
//     );
//   }
//   if (!diag.tokenLooksLikeMeta) {
//     console.warn(
//       JSON.stringify({
//         type: "whatsapp_meta_auth_diagnostic",
//         level: "warn",
//         message:
//           'WHATSAPP_ACCESS_TOKEN does not start with "EAA" (typical Meta user/system token prefix). Verify the token was copied correctly.',
//         tokenLoaded: true,
//         tokenLength: diag.tokenLength,
//         tokenPrefix: diag.tokenPrefix,
//         timestamp: new Date().toISOString(),
//       })
//     );
//   }
// }

// export function isMetaWhatsAppConfigured(): boolean {
//   const provider = metaProviderSetting();
//   // Default is meta; only disable if explicitly set to another provider
//   if (provider && provider !== "meta" && provider !== "whatsapp_cloud") {
//     return false;
//   }
//   const token = metaAccessToken();
//   const phoneId = metaPhoneNumberId();
//   return Boolean(
//     token &&
//       phoneId &&
//       token !== "your_whatsapp_token" &&
//       !token.includes("xxxx") &&
//       token.length > 40
//   );
// }

// // ---------------------------------------------------------------------------
// // Meta Graph response types + postMetaMessage
// // ---------------------------------------------------------------------------

// type MetaGraphError = {
//   message?: string;
//   type?: string;
//   code?: number;
//   error_subcode?: number;
//   error_user_title?: string;
//   error_user_msg?: string;
//   fbtrace_id?: string;
//   error_data?: unknown;
// };

// type MetaGraphResponse = {
//   messages?: { id?: string }[];
//   error?: MetaGraphError;
//   [key: string]: unknown;
// };

// type PostMetaResult = {
//   ok: boolean;
//   status: number;
//   code?: number;
//   messageId?: string;
//   error?: string;
//   raw?: unknown;
// };

// /** Format Meta errors as "(190) Invalid OAuth access token" style messages. */
// function formatMetaError(
//   code: number | undefined,
//   message: string | undefined,
//   httpStatus: number
// ): string {
//   const msg =
//     (message && message.trim()) ||
//     `Meta WhatsApp API HTTP ${httpStatus}`;
//   if (code !== undefined && code !== null && !Number.isNaN(code)) {
//     return `(${code}) ${msg}`;
//   }
//   return msg;
// }

// function isAuthError(code: number | undefined, errorText?: string): boolean {
//   if (code === 190) return true;
//   if (code === 102 || code === 10) return true; // API session / permission
//   if (
//     errorText &&
//     /oauth|access token|invalid.*token|session has expired|authentication|error validating access token/i.test(
//       errorText
//     )
//   ) {
//     return true;
//   }
//   return false;
// }

// /** User-facing message when Meta returns OAuth 190 / expired session. */
// function authErrorUserMessage(
//   code: number | undefined,
//   errorText?: string,
//   subcode?: number
// ): string {
//   const expired =
//     subcode === 463 ||
//     (errorText && /session has expired|expired/i.test(errorText));
//   if (code === 190 && expired) {
//     return (
//       "(190) WhatsApp access token has expired. " +
//       "Generate a new permanent System User token in Meta Business Manager, " +
//       "set WHATSAPP_ACCESS_TOKEN in .env.local (one line), then restart the app."
//     );
//   }
//   if (code === 190) {
//     return (
//       "(190) Invalid OAuth access token. " +
//       "Update WHATSAPP_ACCESS_TOKEN with a valid Meta System User token " +
//       "(permissions: whatsapp_business_messaging, whatsapp_business_management)."
//     );
//   }
//   return formatMetaError(code, errorText, 401);
// }

// function isTemplateLanguageError(
//   code: number | undefined,
//   errorText?: string
// ): boolean {
//   // Do not treat auth as template/language
//   if (isAuthError(code, errorText)) return false;
//   if (
//     errorText &&
//     /language|template|translation|parameter|components|message template/i.test(
//       errorText
//     )
//   ) {
//     return true;
//   }
//   // Common Meta template codes (non-auth)
//   if (
//     code === 132000 ||
//     code === 132001 ||
//     code === 132005 ||
//     code === 132007 ||
//     code === 132012 ||
//     code === 132015 ||
//     code === 132016 ||
//     code === 131008 ||
//     code === 131009
//   ) {
//     return true;
//   }
//   return false;
// }

// async function postMetaMessage(
//   url: string,
//   token: string,
//   body: Record<string, unknown>
// ): Promise<PostMetaResult> {
//   const res = await fetch(url, {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${token}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(body),
//   });

//   const json = (await res.json().catch(() => ({}))) as MetaGraphResponse;
//   const errCode = json.error?.code;
//   const errMessage = json.error?.message;
//   const messageId = json.messages?.[0]?.id;
//   const formattedError = !res.ok
//     ? formatMetaError(errCode, errMessage, res.status)
//     : undefined;

//   // After every response
//   console.info(
//     JSON.stringify({
//       type: "whatsapp_meta_response",
//       status: res.status,
//       ok: res.ok,
//       code: errCode ?? null,
//       message: errMessage ?? null,
//       messageId: messageId ?? null,
//       error: formattedError ?? null,
//       errorType: json.error?.type ?? null,
//       errorSubcode: json.error?.error_subcode ?? null,
//       fbtrace_id: json.error?.fbtrace_id ?? null,
//       timestamp: new Date().toISOString(),
//     })
//   );

//   if (!res.ok) {
//     const subcode = json.error?.error_subcode;
//     const authFacing = isAuthError(errCode, errMessage)
//       ? authErrorUserMessage(errCode, errMessage, subcode)
//       : formattedError;

//     // OAuth / token diagnostics (never log full token)
//     if (isAuthError(errCode, errMessage)) {
//       const diag = getTokenDiagnostics(token);
//       console.error(
//         JSON.stringify({
//           type: "whatsapp_meta_oauth_diagnostic",
//           level: "error",
//           code: errCode ?? null,
//           error_subcode: subcode ?? null,
//           message: errMessage ?? null,
//           formattedError: authFacing,
//           tokenLoaded: diag.tokenLoaded,
//           tokenLength: diag.tokenLength,
//           tokenPrefix: diag.tokenPrefix,
//           tokenLooksLikeMeta: diag.tokenLooksLikeMeta,
//           hint:
//             errCode === 190
//               ? "Access token expired or revoked (OAuth 190). Create a permanent System User token in Meta Business Manager → System Users → Generate token (whatsapp_business_messaging, whatsapp_business_management), paste into WHATSAPP_ACCESS_TOKEN on ONE line, restart the server."
//               : "Check token permissions (whatsapp_business_messaging) and WHATSAPP_PHONE_NUMBER_ID.",
//           timestamp: new Date().toISOString(),
//         })
//       );
//     }

//     return {
//       ok: false,
//       status: res.status,
//       code: errCode,
//       messageId: undefined,
//       error: authFacing,
//       raw: json,
//     };
//   }

//   return {
//     ok: true,
//     status: res.status,
//     code: undefined,
//     messageId,
//     error: undefined,
//     raw: json,
//   };
// }

// function logRequest(params: {
//   apiVersion: string;
//   phoneNumberId: string;
//   templateName: string | null;
//   templateLanguage: string | null;
//   tokenDiag: TokenDiagnostics;
//   recipient: string;
//   mode: "template" | "text";
//   paramCount?: number;
//   businessAccountId?: string;
// }): void {
//   console.info(
//     JSON.stringify({
//       type: "whatsapp_meta_request",
//       provider: "meta",
//       apiVersion: params.apiVersion,
//       phoneNumberId: params.phoneNumberId,
//       templateName: params.templateName,
//       templateLanguage: params.templateLanguage,
//       tokenLoaded: params.tokenDiag.tokenLoaded,
//       tokenLength: params.tokenDiag.tokenLength,
//       tokenPrefix: params.tokenDiag.tokenPrefix,
//       recipient: params.recipient,
//       mode: params.mode,
//       paramCount: params.paramCount ?? null,
//       businessAccountId: params.businessAccountId || null,
//       timestamp: new Date().toISOString(),
//     })
//   );
// }

// // ---------------------------------------------------------------------------
// // Provider
// // ---------------------------------------------------------------------------

// export class MetaWhatsAppProvider implements WhatsAppProvider {
//   readonly id: NotificationProviderId = "meta";
//   readonly channel = "whatsapp" as const;

//   isConfigured(): boolean {
//     return isMetaWhatsAppConfigured();
//   }

//   async send(input: {
//     recipient: string;
//     subject: string;
//     text: string;
//     html?: string;
//     meta?: Record<string, unknown>;
//   }): Promise<{
//     ok: boolean;
//     externalId?: string;
//     error?: string;
//     raw?: unknown;
//   }> {
//     // --- Configuration / env validation ---
//     if (!this.isConfigured()) {
//       return {
//         ok: false,
//         error:
//           "Meta WhatsApp Cloud API not configured. Set WHATSAPP_PROVIDER=meta, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID.",
//       };
//     }

//     const token = metaAccessToken();
//     const phoneNumberId = metaPhoneNumberId();
//     const version = metaApiVersion();
//     const templateName = metaTemplateName();
//     const templateLang = metaTemplateLang();
//     const businessAccountId = metaBusinessAccountId();
//     const tokenDiag = getTokenDiagnostics(token);

//     logTokenWarningIfNeeded(tokenDiag);

//     if (!tokenDiag.tokenLoaded || tokenDiag.tokenLength <= 40) {
//       return {
//         ok: false,
//         error:
//           "Invalid WHATSAPP_ACCESS_TOKEN: missing or too short. Paste a full Meta access token on one line.",
//       };
//     }

//     if (!phoneNumberId) {
//       return {
//         ok: false,
//         error:
//           "Invalid WHATSAPP_PHONE_NUMBER_ID: missing. Set the WhatsApp Phone Number ID from Meta App Dashboard.",
//       };
//     }

//     const to = normalizeWhatsAppDigits(input.recipient);
//     if (!input.recipient?.trim()) {
//       return { ok: false, error: "Invalid WhatsApp recipient: phone is empty" };
//     }
//     if (to.length < 11) {
//       return {
//         ok: false,
//         error: `Invalid WhatsApp recipient phone (normalized length ${to.length}, need E.164 digits e.g. 91XXXXXXXXXX)`,
//       };
//     }

//     const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
//     const vars = (input.meta?.templateParams as string[]) || [];

//     // 1) Preferred: approved template (works outside 24h window)
//     if (templateName) {
//       const templateBody: Record<string, unknown> = {
//         messaging_product: "whatsapp",
//         to,
//         type: "template",
//         template: {
//           name: templateName,
//           language: { code: templateLang },
//           ...(vars.length
//             ? {
//                 components: [
//                   {
//                     type: "body",
//                     parameters: vars.map((text) => ({
//                       type: "text",
//                       text: String(text || "—").slice(0, 1024) || "—",
//                     })),
//                   },
//                 ],
//               }
//             : {}),
//         },
//       };

//       logRequest({
//         apiVersion: version,
//         phoneNumberId,
//         templateName,
//         templateLanguage: templateLang,
//         tokenDiag,
//         recipient: to,
//         mode: "template",
//         paramCount: vars.length,
//         businessAccountId,
//       });

//       console.info(
//         JSON.stringify({
//           type: "whatsapp_meta_template_diagnostic",
//           templateName,
//           templateLanguage: templateLang,
//           bodyParameterCount: vars.length,
//           subject: input.subject,
//           hint:
//             vars.length === 0
//               ? "No templateParams provided — template body must have zero variables or Meta will reject."
//               : `Sending ${vars.length} body parameter(s). Count must match the approved template.`,
//           timestamp: new Date().toISOString(),
//         })
//       );

//       try {
//         const r = await postMetaMessage(url, token, templateBody);
//         if (r.ok) {
//           return { ok: true, externalId: r.messageId, raw: r.raw };
//         }

//         // Authentication (190 etc.) — stop immediately, no text fallback
//         if (isAuthError(r.code, r.error)) {
//           console.error(
//             JSON.stringify({
//               type: "whatsapp_meta_auth_abort",
//               code: r.code ?? null,
//               error: r.error,
//               message:
//                 "Aborting send: authentication/OAuth failure. Free-form text fallback will not run.",
//               timestamp: new Date().toISOString(),
//             })
//           );
//           return {
//             ok: false,
//             error: r.error || "(190) Invalid OAuth access token",
//             raw: r.raw,
//           };
//         }

//         // Retry en → en_US only for template/language related errors
//         // (kept when primary language is "en"; default is en_US so this is opt-in via env)
//         if (
//           templateLang === "en" &&
//           isTemplateLanguageError(r.code, r.error)
//         ) {
//           const retryLangBody: Record<string, unknown> = {
//             messaging_product: "whatsapp",
//             to,
//             type: "template",
//             template: {
//               name: templateName,
//               language: { code: "en_US" },
//               ...(vars.length
//                 ? {
//                     components: [
//                       {
//                         type: "body",
//                         parameters: vars.map((text) => ({
//                           type: "text",
//                           text: String(text || "—").slice(0, 1024) || "—",
//                         })),
//                       },
//                     ],
//                   }
//                 : {}),
//             },
//           };

//           console.info(
//             JSON.stringify({
//               type: "whatsapp_meta_retry",
//               reason: "template_lang_en_to_en_US",
//               previousCode: r.code ?? null,
//               previousError: r.error,
//               timestamp: new Date().toISOString(),
//             })
//           );

//           logRequest({
//             apiVersion: version,
//             phoneNumberId,
//             templateName,
//             templateLanguage: "en_US",
//             tokenDiag,
//             recipient: to,
//             mode: "template",
//             paramCount: vars.length,
//             businessAccountId,
//           });

//           const r2 = await postMetaMessage(url, token, retryLangBody);
//           if (r2.ok) {
//             return { ok: true, externalId: r2.messageId, raw: r2.raw };
//           }

//           // Auth on retry — abort without text fallback
//           if (isAuthError(r2.code, r2.error)) {
//             return {
//               ok: false,
//               error: r2.error || "(190) Invalid OAuth access token",
//               raw: r2.raw,
//             };
//           }

//           // Template still failed (non-auth) — fall through to free-form text
//           console.info(
//             JSON.stringify({
//               type: "whatsapp_meta_fallback_text",
//               previousCode: r2.code ?? r.code ?? null,
//               previousError: r2.error || r.error,
//               reason:
//                 "template_failed_after_lang_retry_auth_ok_using_session_text",
//               timestamp: new Date().toISOString(),
//             })
//           );
//         } else if (isTemplateLanguageError(r.code, r.error) || !isAuthError(r.code, r.error)) {
//           // Auth succeeded path: non-auth template failure → free-form text fallback
//           console.info(
//             JSON.stringify({
//               type: "whatsapp_meta_fallback_text",
//               previousCode: r.code ?? null,
//               previousError: r.error,
//               reason: "template_failed_auth_ok_using_session_text",
//               isTemplateLanguageError: isTemplateLanguageError(
//                 r.code,
//                 r.error
//               ),
//               timestamp: new Date().toISOString(),
//             })
//           );
//         } else {
//           // Should not reach (auth already handled), but be safe
//           return {
//             ok: false,
//             error: r.error || "Meta WhatsApp template send failed",
//             raw: r.raw,
//           };
//         }
//       } catch (e) {
//         const message =
//           e instanceof Error ? e.message : "template send failed";
//         console.error(
//           JSON.stringify({
//             type: "whatsapp_meta_error",
//             error: message,
//             phase: "template",
//             timestamp: new Date().toISOString(),
//           })
//         );
//         // Network/parse errors: still attempt text fallback (auth unknown)
//         console.info(
//           JSON.stringify({
//             type: "whatsapp_meta_fallback_text",
//             previousError: message,
//             reason: "template_exception_trying_session_text",
//             timestamp: new Date().toISOString(),
//           })
//         );
//       }
//     } else {
//       console.info(
//         JSON.stringify({
//           type: "whatsapp_meta_template_diagnostic",
//           templateName: null,
//           message:
//             "WHATSAPP_TEMPLATE_NAME not set — using free-form text only (requires open customer care window).",
//           timestamp: new Date().toISOString(),
//         })
//       );
//     }

//     // 2) Free-form session text (works within customer service window)
//     // Only when authentication succeeded / not aborted above.
//     const textBody: Record<string, unknown> = {
//       messaging_product: "whatsapp",
//       recipient_type: "individual",
//       to,
//       type: "text",
//       text: {
//         preview_url: false,
//         body: input.text.slice(0, 4096),
//       },
//     };

//     logRequest({
//       apiVersion: version,
//       phoneNumberId,
//       templateName: templateName || null,
//       templateLanguage: templateName ? templateLang : null,
//       tokenDiag,
//       recipient: to,
//       mode: "text",
//       businessAccountId,
//     });

//     try {
//       const r = await postMetaMessage(url, token, textBody);
//       if (r.ok) {
//         return { ok: true, externalId: r.messageId, raw: r.raw };
//       }

//       // Auth on text path — return immediately with formatted code
//       if (isAuthError(r.code, r.error)) {
//         return {
//           ok: false,
//           error: r.error || "(190) Invalid OAuth access token",
//           raw: r.raw,
//         };
//       }

//       return {
//         ok: false,
//         error: r.error || "Meta WhatsApp free-form text send failed",
//         raw: r.raw,
//       };
//     } catch (e) {
//       const message = e instanceof Error ? e.message : "Meta WhatsApp failed";
//       console.error(
//         JSON.stringify({
//           type: "whatsapp_meta_error",
//           error: message,
//           phase: "text",
//           timestamp: new Date().toISOString(),
//         })
//       );
//       return { ok: false, error: message };
//     }
//   }
// }
/**
 * Official Meta WhatsApp Cloud API provider.
 * Env:
 *   WHATSAPP_PROVIDER=meta
 *   WHATSAPP_ACCESS_TOKEN=
 *   WHATSAPP_PHONE_NUMBER_ID=
 *   WHATSAPP_BUSINESS_ACCOUNT_ID= (optional)
 *   WHATSAPP_API_VERSION=v23.0 (optional)
 *   WHATSAPP_TEMPLATE_NAME=appointment_confirmation (optional but recommended)
 *   WHATSAPP_TEMPLATE_LANG=en_US (or en)
 *
 * Graph: POST https://graph.facebook.com/{version}/{PHONE_NUMBER_ID}/messages
 * Auth: Bearer ACCESS_TOKEN
 *
 * Automatic booking notifications use template first, then free-form text
 * fallback when auth succeeded and the failure is template/language related
 * (not OAuth / code 190).
 */

import type { WhatsAppProvider } from "@/lib/notifications/core/interfaces";
import type { NotificationProviderId } from "@/lib/notifications/core/types";
import { normalizeWhatsAppDigits } from "@/lib/notifications/providers/whatsapp/click-to-chat-provider";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

const ENV_DEFAULTS = {
  WHATSAPP_PROVIDER: "meta",
  WHATSAPP_API_VERSION: "v23.0",
  WHATSAPP_TEMPLATE_LANG: "en_US",
} as const;

/**
 * Read and trim an environment variable.
 * Collapses internal whitespace (common when pasting multi-line secrets).
 */
function env(key: string, fallback = ""): string {
  const raw = process.env[key];
  if (raw === undefined || raw === null) {
    return fallback.trim();
  }
  // Collapse all whitespace (including newlines) then outer-trim
  return String(raw).replace(/\s+/g, " ").trim() || fallback.trim();
}

/** Access token: strip ALL whitespace (tokens must be continuous). */
function metaAccessToken(): string {
  return env("WHATSAPP_ACCESS_TOKEN", "").replace(/\s+/g, "");
}

function metaPhoneNumberId(): string {
  return env("WHATSAPP_PHONE_NUMBER_ID", "").replace(/\s+/g, "");
}

function metaApiVersion(): string {
  return env("WHATSAPP_API_VERSION", ENV_DEFAULTS.WHATSAPP_API_VERSION);
}

function metaTemplateName(): string {
  return env("WHATSAPP_TEMPLATE_NAME", "");
}

function metaTemplateLang(): string {
  return env(
    "WHATSAPP_TEMPLATE_LANG",
    ENV_DEFAULTS.WHATSAPP_TEMPLATE_LANG
  );
}

function metaProviderSetting(): string {
  return env(
    "WHATSAPP_PROVIDER",
    ENV_DEFAULTS.WHATSAPP_PROVIDER
  ).toLowerCase();
}

function metaBusinessAccountId(): string {
  return env("WHATSAPP_BUSINESS_ACCOUNT_ID", "").replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Token / auth diagnostics (never log full token)
// ---------------------------------------------------------------------------

type TokenDiagnostics = {
  tokenLoaded: boolean;
  tokenLength: number;
  tokenPrefix: string;
  tokenLooksLikeMeta: boolean;
};

function getTokenDiagnostics(token: string): TokenDiagnostics {
  const tokenLoaded = Boolean(token && token.length > 0);
  const tokenLength = token.length;
  const tokenPrefix = tokenLoaded ? token.slice(0, 6) : "";
  const tokenLooksLikeMeta = token.startsWith("EAA");
  return { tokenLoaded, tokenLength, tokenPrefix, tokenLooksLikeMeta };
}

function logTokenWarningIfNeeded(diag: TokenDiagnostics): void {
  if (!diag.tokenLoaded) {
    console.warn(
      JSON.stringify({
        type: "whatsapp_meta_auth_diagnostic",
        level: "warn",
        message: "WHATSAPP_ACCESS_TOKEN is missing or empty",
        tokenLoaded: false,
        tokenLength: 0,
        tokenPrefix: "",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }
  if (diag.tokenLength <= 40) {
    console.warn(
      JSON.stringify({
        type: "whatsapp_meta_auth_diagnostic",
        level: "warn",
        message: "WHATSAPP_ACCESS_TOKEN length is unusually short",
        tokenLoaded: true,
        tokenLength: diag.tokenLength,
        tokenPrefix: diag.tokenPrefix,
        timestamp: new Date().toISOString(),
      })
    );
  }
  if (!diag.tokenLooksLikeMeta) {
    console.warn(
      JSON.stringify({
        type: "whatsapp_meta_auth_diagnostic",
        level: "warn",
        message:
          'WHATSAPP_ACCESS_TOKEN does not start with "EAA" (typical Meta user/system token prefix). Verify the token was copied correctly.',
        tokenLoaded: true,
        tokenLength: diag.tokenLength,
        tokenPrefix: diag.tokenPrefix,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

export function isMetaWhatsAppConfigured(): boolean {
  const provider = metaProviderSetting();
  // Default is meta; only disable if explicitly set to another provider
  if (provider && provider !== "meta" && provider !== "whatsapp_cloud") {
    return false;
  }
  const token = metaAccessToken();
  const phoneId = metaPhoneNumberId();
  return Boolean(
    token &&
      phoneId &&
      token !== "your_whatsapp_token" &&
      !token.includes("xxxx") &&
      token.length > 40
  );
}

// ---------------------------------------------------------------------------
// Meta Graph response types + postMetaMessage
// ---------------------------------------------------------------------------

type MetaGraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  error_data?: unknown;
};

type MetaGraphResponse = {
  messages?: { id?: string }[];
  error?: MetaGraphError;
  [key: string]: unknown;
};

type PostMetaResult = {
  ok: boolean;
  status: number;
  code?: number;
  messageId?: string;
  error?: string;
  raw?: unknown;
};

/** Format Meta errors as "(190) Invalid OAuth access token" style messages. */
function formatMetaError(
  code: number | undefined,
  message: string | undefined,
  httpStatus: number
): string {
  const msg =
    (message && message.trim()) ||
    `Meta WhatsApp API HTTP ${httpStatus}`;
  if (code !== undefined && code !== null && !Number.isNaN(code)) {
    return `(${code}) ${msg}`;
  }
  return msg;
}

function isAuthError(code: number | undefined, errorText?: string): boolean {
  if (code === 190) return true;
  if (code === 102 || code === 10) return true; // API session / permission
  if (
    errorText &&
    /oauth|access token|invalid.*token|session has expired|authentication|error validating access token/i.test(
      errorText
    )
  ) {
    return true;
  }
  return false;
}

/** User-facing message when Meta returns OAuth 190 / expired session. */
function authErrorUserMessage(
  code: number | undefined,
  errorText?: string,
  subcode?: number
): string {
  const expired =
    subcode === 463 ||
    (errorText && /session has expired|expired/i.test(errorText));
  if (code === 190 && expired) {
    return (
      "(190) WhatsApp access token has expired. " +
      "Generate a new permanent System User token in Meta Business Manager, " +
      "set WHATSAPP_ACCESS_TOKEN in .env.local (one line), then restart the app."
    );
  }
  if (code === 190) {
    return (
      "(190) Invalid OAuth access token. " +
      "Update WHATSAPP_ACCESS_TOKEN with a valid Meta System User token " +
      "(permissions: whatsapp_business_messaging, whatsapp_business_management)."
    );
  }
  return formatMetaError(code, errorText, 401);
}

function isTemplateLanguageError(
  code: number | undefined,
  errorText?: string
): boolean {
  // Do not treat auth as template/language
  if (isAuthError(code, errorText)) return false;
  if (
    errorText &&
    /language|template|translation|parameter|components|message template/i.test(
      errorText
    )
  ) {
    return true;
  }
  // Common Meta template codes (non-auth)
  if (
    code === 132000 ||
    code === 132001 ||
    code === 132005 ||
    code === 132007 ||
    code === 132012 ||
    code === 132015 ||
    code === 132016 ||
    code === 131008 ||
    code === 131009
  ) {
    return true;
  }
  return false;
}

async function postMetaMessage(
  url: string,
  token: string,
  body: Record<string, unknown>
): Promise<PostMetaResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as MetaGraphResponse;
  const errCode = json.error?.code;
  const errMessage = json.error?.message;
  const messageId = json.messages?.[0]?.id;
  const formattedError = !res.ok
    ? formatMetaError(errCode, errMessage, res.status)
    : undefined;

  // After every response
  console.info(
    JSON.stringify({
      type: "whatsapp_meta_response",
      status: res.status,
      ok: res.ok,
      code: errCode ?? null,
      message: errMessage ?? null,
      messageId: messageId ?? null,
      error: formattedError ?? null,
      errorType: json.error?.type ?? null,
      errorSubcode: json.error?.error_subcode ?? null,
      fbtrace_id: json.error?.fbtrace_id ?? null,
      timestamp: new Date().toISOString(),
    })
  );

  if (!res.ok) {
    const subcode = json.error?.error_subcode;
    const authFacing = isAuthError(errCode, errMessage)
      ? authErrorUserMessage(errCode, errMessage, subcode)
      : formattedError;

    // OAuth / token diagnostics (never log full token)
    if (isAuthError(errCode, errMessage)) {
      const diag = getTokenDiagnostics(token);
      console.error(
        JSON.stringify({
          type: "whatsapp_meta_oauth_diagnostic",
          level: "error",
          code: errCode ?? null,
          error_subcode: subcode ?? null,
          message: errMessage ?? null,
          formattedError: authFacing,
          tokenLoaded: diag.tokenLoaded,
          tokenLength: diag.tokenLength,
          tokenPrefix: diag.tokenPrefix,
          tokenLooksLikeMeta: diag.tokenLooksLikeMeta,
          hint:
            errCode === 190
              ? "Access token expired or revoked (OAuth 190). Create a permanent System User token in Meta Business Manager → System Users → Generate token (whatsapp_business_messaging, whatsapp_business_management), paste into WHATSAPP_ACCESS_TOKEN on ONE line, restart the server."
              : "Check token permissions (whatsapp_business_messaging) and WHATSAPP_PHONE_NUMBER_ID.",
          timestamp: new Date().toISOString(),
        })
      );
    }

    return {
      ok: false,
      status: res.status,
      code: errCode,
      messageId: undefined,
      error: authFacing,
      raw: json,
    };
  }

  return {
    ok: true,
    status: res.status,
    code: undefined,
    messageId,
    error: undefined,
    raw: json,
  };
}

function logRequest(params: {
  apiVersion: string;
  phoneNumberId: string;
  templateName: string | null;
  templateLanguage: string | null;
  tokenDiag: TokenDiagnostics;
  recipient: string;
  mode: "template" | "text";
  paramCount?: number;
  businessAccountId?: string;
}): void {
  console.info(
    JSON.stringify({
      type: "whatsapp_meta_request",
      provider: "meta",
      apiVersion: params.apiVersion,
      phoneNumberId: params.phoneNumberId,
      templateName: params.templateName,
      templateLanguage: params.templateLanguage,
      tokenLoaded: params.tokenDiag.tokenLoaded,
      tokenLength: params.tokenDiag.tokenLength,
      tokenPrefix: params.tokenDiag.tokenPrefix,
      recipient: params.recipient,
      mode: params.mode,
      paramCount: params.paramCount ?? null,
      businessAccountId: params.businessAccountId || null,
      timestamp: new Date().toISOString(),
    })
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly id: NotificationProviderId = "meta";
  readonly channel = "whatsapp" as const;

  isConfigured(): boolean {
    return isMetaWhatsAppConfigured();
  }

  async send(input: {
    recipient: string;
    subject: string;
    text: string;
    html?: string;
    meta?: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    externalId?: string;
    error?: string;
    raw?: unknown;
  }> {
    // --- Configuration / env validation ---
    if (!this.isConfigured()) {
      return {
        ok: false,
        error:
          "Meta WhatsApp Cloud API not configured. Set WHATSAPP_PROVIDER=meta, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID.",
      };
    }

    const token = metaAccessToken();
    const phoneNumberId = metaPhoneNumberId();
    const version = metaApiVersion();
    const templateName = metaTemplateName();
    const templateLang = metaTemplateLang();
    const businessAccountId = metaBusinessAccountId();
    const tokenDiag = getTokenDiagnostics(token);

    logTokenWarningIfNeeded(tokenDiag);

    if (!tokenDiag.tokenLoaded || tokenDiag.tokenLength <= 40) {
      return {
        ok: false,
        error:
          "Invalid WHATSAPP_ACCESS_TOKEN: missing or too short. Paste a full Meta access token on one line.",
      };
    }

    if (!phoneNumberId) {
      return {
        ok: false,
        error:
          "Invalid WHATSAPP_PHONE_NUMBER_ID: missing. Set the WhatsApp Phone Number ID from Meta App Dashboard.",
      };
    }

    const to = normalizeWhatsAppDigits(input.recipient);
    if (!input.recipient?.trim()) {
      return { ok: false, error: "Invalid WhatsApp recipient: phone is empty" };
    }
    if (to.length < 11) {
      return {
        ok: false,
        error: `Invalid WhatsApp recipient phone (normalized length ${to.length}, need E.164 digits e.g. 91XXXXXXXXXX)`,
      };
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const vars = (input.meta?.templateParams as string[]) || [];

// hello_world template accepts NO body parameters
const templateParams =
  templateName === "hello_world" ? [] : vars;

    // 1) Preferred: approved template (works outside 24h window)
    if (templateName) {
      const templateBody: Record<string, unknown> = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          ...(templateParams.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: templateParams.map((text) => ({
                      type: "text",
                      text: String(text || "—").slice(0, 1024) || "—",
                    })),
                  },
                ],
              }
            : {}),
        },
      };

      logRequest({
        apiVersion: version,
        phoneNumberId,
        templateName,
        templateLanguage: templateLang,
        tokenDiag,
        recipient: to,
        mode: "template",
        paramCount: templateParams.length,
        businessAccountId,
      });

      console.info(
        JSON.stringify({
          type: "whatsapp_meta_template_diagnostic",
          templateName,
          templateLanguage: templateLang,
          bodyParameterCount: templateParams.length,
          subject: input.subject,
          hint:
            templateParams.length === 0
              ? "No templateParams provided — template body must have zero variables or Meta will reject."
              : `Sending ${templateParams.length} body parameter(s). Count must match the approved template.`,
          timestamp: new Date().toISOString(),
        })
      );

      try {
        const r = await postMetaMessage(url, token, templateBody);
        if (r.ok) {
          return { ok: true, externalId: r.messageId, raw: r.raw };
        }

        // Authentication (190 etc.) — stop immediately, no text fallback
        if (isAuthError(r.code, r.error)) {
          console.error(
            JSON.stringify({
              type: "whatsapp_meta_auth_abort",
              code: r.code ?? null,
              error: r.error,
              message:
                "Aborting send: authentication/OAuth failure. Free-form text fallback will not run.",
              timestamp: new Date().toISOString(),
            })
          );
          return {
            ok: false,
            error: r.error || "(190) Invalid OAuth access token",
            raw: r.raw,
          };
        }

        // Retry en → en_US only for template/language related errors
        // (kept when primary language is "en"; default is en_US so this is opt-in via env)
        if (
          templateLang === "en" &&
          isTemplateLanguageError(r.code, r.error)
        ) {
          const retryLangBody: Record<string, unknown> = {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: templateName,
              language: { code: "en_US" },
              ...(templateParams.length
                ? {
                    components: [
                      {
                        type: "body",
                        parameters: templateParams.map((text) => ({
                          type: "text",
                          text: String(text || "—").slice(0, 1024) || "—",
                        })),
                      },
                    ],
                  }
                : {}),
            },
          };

          console.info(
            JSON.stringify({
              type: "whatsapp_meta_retry",
              reason: "template_lang_en_to_en_US",
              previousCode: r.code ?? null,
              previousError: r.error,
              timestamp: new Date().toISOString(),
            })
          );

          logRequest({
            apiVersion: version,
            phoneNumberId,
            templateName,
            templateLanguage: "en_US",
            tokenDiag,
            recipient: to,
            mode: "template",
            paramCount: templateParams.length,
            businessAccountId,
          });

          const r2 = await postMetaMessage(url, token, retryLangBody);
          if (r2.ok) {
            return { ok: true, externalId: r2.messageId, raw: r2.raw };
          }

          // Auth on retry — abort without text fallback
          if (isAuthError(r2.code, r2.error)) {
            return {
              ok: false,
              error: r2.error || "(190) Invalid OAuth access token",
              raw: r2.raw,
            };
          }

          // Template still failed (non-auth) — fall through to free-form text
          console.info(
            JSON.stringify({
              type: "whatsapp_meta_fallback_text",
              previousCode: r2.code ?? r.code ?? null,
              previousError: r2.error || r.error,
              reason:
                "template_failed_after_lang_retry_auth_ok_using_session_text",
              timestamp: new Date().toISOString(),
            })
          );
        } else if (isTemplateLanguageError(r.code, r.error) || !isAuthError(r.code, r.error)) {
          // Auth succeeded path: non-auth template failure → free-form text fallback
          console.info(
            JSON.stringify({
              type: "whatsapp_meta_fallback_text",
              previousCode: r.code ?? null,
              previousError: r.error,
              reason: "template_failed_auth_ok_using_session_text",
              isTemplateLanguageError: isTemplateLanguageError(
                r.code,
                r.error
              ),
              timestamp: new Date().toISOString(),
            })
          );
        } else {
          // Should not reach (auth already handled), but be safe
          return {
            ok: false,
            error: r.error || "Meta WhatsApp template send failed",
            raw: r.raw,
          };
        }
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "template send failed";
        console.error(
          JSON.stringify({
            type: "whatsapp_meta_error",
            error: message,
            phase: "template",
            timestamp: new Date().toISOString(),
          })
        );
        // Network/parse errors: still attempt text fallback (auth unknown)
        console.info(
          JSON.stringify({
            type: "whatsapp_meta_fallback_text",
            previousError: message,
            reason: "template_exception_trying_session_text",
            timestamp: new Date().toISOString(),
          })
        );
      }
    } else {
      console.info(
        JSON.stringify({
          type: "whatsapp_meta_template_diagnostic",
          templateName: null,
          message:
            "WHATSAPP_TEMPLATE_NAME not set — using free-form text only (requires open customer care window).",
          timestamp: new Date().toISOString(),
        })
      );
    }

    // Do not fall back to free-form text when testing hello_world.
// If the template fails, return the template error directly.
if (templateName === "hello_world") {
  return {
    ok: false,
    error:
      "hello_world template failed. Free-form text fallback is intentionally disabled during testing.",
  };
}

// 2) Free-form session text (works within customer service window)
    // Only when authentication succeeded / not aborted above.
    const textBody: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: input.text.slice(0, 4096),
      },
    };

    logRequest({
      apiVersion: version,
      phoneNumberId,
      templateName: templateName || null,
      templateLanguage: templateName ? templateLang : null,
      tokenDiag,
      recipient: to,
      mode: "text",
      businessAccountId,
    });

    try {
      const r = await postMetaMessage(url, token, textBody);
      if (r.ok) {
        return { ok: true, externalId: r.messageId, raw: r.raw };
      }

      // Auth on text path — return immediately with formatted code
      if (isAuthError(r.code, r.error)) {
        return {
          ok: false,
          error: r.error || "(190) Invalid OAuth access token",
          raw: r.raw,
        };
      }

      return {
        ok: false,
        error: r.error || "Meta WhatsApp free-form text send failed",
        raw: r.raw,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Meta WhatsApp failed";
      console.error(
        JSON.stringify({
          type: "whatsapp_meta_error",
          error: message,
          phase: "text",
          timestamp: new Date().toISOString(),
        })
      );
      return { ok: false, error: message };
    }
  }
}
