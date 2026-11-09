// =====================================================
// EMPLOYEE DOCUMENTS STORAGE (Supabase bucket "employee-documents", PRIVATE)
//
// Backend only: uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env. The browser never
// talks to Storage. Records store only the object path (e.g. resignations/1561/letter-123.pdf);
// files are opened through short-lived signed URLs after the route checks access.
// Older records hold a public URL (…/object/public/employee-documents/<path>); toStoragePath()
// turns it back into the path when reading.
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { WorkflowError } from "./manpowerWorkflow.js";

export const DOCUMENTS_BUCKET = "employee-documents";
export const SIGNED_URL_SECONDS = 10 * 60;
export const FILE_NOT_FOUND_MESSAGE = "File not found – ask the employee to upload it again";

// Created on first use, so backend/.env (loaded by db.js) is in place
let client;
const storageClient = () => {
    if (client === undefined) {
        client = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
            : null;
    }
    return client;
};

export const isDocumentStorageConfigured = () => Boolean(storageClient());

// Path inside the bucket, from a stored path or an old public / signed / authenticated URL
export function toStoragePath(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, "").replace(new RegExp(`^${DOCUMENTS_BUCKET}/`), "") || null;
    try {
        const { pathname } = new URL(raw);
        const match = pathname.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${DOCUMENTS_BUCKET}/(.+)$`));
        return match ? decodeURIComponent(match[1]) : null;
    } catch {
        return null;
    }
}

const reasonOf = (error) => error?.message || error?.error || String(error || "unknown error");
const isNotFound = (error) => {
    const status = Number(error?.statusCode || error?.status || error?.originalError?.status);
    if (/bucket/i.test(reasonOf(error))) return false; // "Bucket not found" is a server setup problem
    return status === 404 || /not.?found/i.test(reasonOf(error));
};

// Uploads with the service key; throws a WorkflowError "<label> could not be uploaded: <reason>"
export async function uploadDocument(path, buffer, { contentType, label = "The file" } = {}) {
    const supabase = storageClient();
    if (!supabase) throw new WorkflowError(`${label} could not be uploaded: document storage is not configured on the server`, 503);
    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (error) {
        console.error(`Storage upload to ${DOCUMENTS_BUCKET}/${path} failed:`, error);
        throw new WorkflowError(`${label} could not be uploaded: ${reasonOf(error)}`, 502);
    }
    return path;
}

// Signed URL (10 minutes). A missing file → 404 with FILE_NOT_FOUND_MESSAGE.
export async function signedDocumentUrl(storedValue, { downloadName } = {}) {
    const path = toStoragePath(storedValue);
    if (!path) throw new WorkflowError(FILE_NOT_FOUND_MESSAGE, 404);
    const supabase = storageClient();
    if (!supabase) throw new WorkflowError("Document storage is not configured on the server", 503);
    const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS, downloadName ? { download: downloadName } : undefined);
    if (error || !data?.signedUrl) {
        console.error(`Storage signed URL for ${DOCUMENTS_BUCKET}/${path} failed:`, error);
        if (!error || isNotFound(error)) throw new WorkflowError(FILE_NOT_FOUND_MESSAGE, 404);
        throw new WorkflowError(`The file could not be opened: ${reasonOf(error)}`, 502);
    }
    return { url: data.signedUrl, path, expiresIn: SIGNED_URL_SECONDS };
}
