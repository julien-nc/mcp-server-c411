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

export function errorContent(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
    isError: true,
  };
}
