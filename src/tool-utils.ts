export function textContent(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };
}

export function textWithStructuredContent<T>(text: string, structuredContent: T) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
    structuredContent,
  };
}

export function errorContent<T extends Record<string, unknown>>(text: string, structuredContent?: T) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
    ...(structuredContent ? { structuredContent } : {}),
    isError: true,
  };
}
