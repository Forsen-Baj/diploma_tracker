namespace DiplomaTracker.Api.Models;

/// One page of a list, with the total so a caller can render page controls and a count without
/// a second request. `Page` is 1-based.
public class PagedResponse<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int Total { get; init; }

    public static PagedResponse<T> Empty(int page, int pageSize) =>
        new() { Items = [], Page = page, PageSize = pageSize, Total = 0 };
}
