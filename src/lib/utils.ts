import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ErrorPayload } from "@/types/models";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatError(err: unknown): ErrorPayload {
  if (typeof err === "object" && err !== null) {
    const maybe = err as Record<string, unknown>;
    if (typeof maybe.code === "string" && typeof maybe.message === "string") {
      return { code: maybe.code, message: maybe.message };
    }
    if (typeof maybe.message === "string") {
      return { code: "UNKNOWN_ERROR", message: maybe.message };
    }
  }
  if (typeof err === "string") {
    return { code: "ERROR", message: err };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred.",
  };
}

