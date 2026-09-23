using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface ITopicService
{
    Task<(IReadOnlyList<TopicResponse>? topics, string? error)> GetTopicsAsync(UserContext user, TopicQuery query);
    Task<(TopicResponse? topic, string? error)> GetTopicAsync(UserContext user, Guid id);
    Task<(TopicResponse? topic, string? error)> CreateTopicAsync(UserContext user, CreateTopicRequest request);
    Task<(TopicResponse? topic, string? error)> UpdateTopicAsync(UserContext user, Guid id, UpdateTopicRequest request);
    Task<(bool success, string? error)> DeleteTopicAsync(UserContext user, Guid id);
    Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync();
}
