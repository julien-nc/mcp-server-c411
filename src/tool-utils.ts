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
