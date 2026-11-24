// src/lib/supabase.ts
// Simple Supabase client wrapper – reads configuration from environment variables.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || ""; // Vite env prefix for front‑end
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to upload a file (Blob) to Supabase Storage under the "recordings" bucket.
export async function uploadRecording(blob: Blob, filename: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from("recordings").upload(filename, blob, {
      cacheControl: "3600",
      upsert: true,
    });
    if (error) throw error;
    // Returns a public URL (if bucket is public) – otherwise you can use getPublicUrl
    const { publicURL } = supabase.storage.from("recordings").getPublicUrl(data.path);
    return publicURL;
  } catch (e) {
    console.error("Supabase upload error", e);
    return null;
  }
}
