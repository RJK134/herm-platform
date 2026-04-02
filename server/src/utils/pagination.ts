export interface PaginationParams {
  page: number;
  limit: number;
}

export function getPagination(query: { page?: string; limit?: string }): PaginationParams {
  return {
    page: Math.max(1, parseInt(query.page || '1')),
    limit: Math.min(100, Math.max(1, parseInt(query.limit || '50'))),
  };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}
