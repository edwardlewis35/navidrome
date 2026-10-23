export const trashErrorMessage = (error, fallback) =>
  error?.body?.error || error?.message || fallback
