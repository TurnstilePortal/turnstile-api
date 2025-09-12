import { z } from "zod";

export interface PaginationParams {
  limit: number;
  cursor: number;
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    cursor: string | null;
    next_cursor: string | null;
    has_more: boolean;
  };
}

export const paginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 100;
      const num = parseInt(val, 10);
      return num > 0 && num <= 1000 ? num : 100;
    }),
  cursor: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 0;
      const num = parseInt(val, 10);
      return num >= 0 ? num : 0;
    }),
});

export function createPaginatedResponse<T>(
  items: T[],
  limit: number,
  cursor: number,
  getItemId: (item: T) => number,
): PaginationResponse<T> {
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, -1) : items;
  const nextCursor = resultItems.length > 0 ? getItemId(resultItems[resultItems.length - 1]).toString() : null;

  return {
    data: resultItems,
    pagination: {
      limit,
      cursor: cursor > 0 ? cursor.toString() : null,
      next_cursor: hasMore ? nextCursor : null,
      has_more: hasMore,
    },
  };
}
