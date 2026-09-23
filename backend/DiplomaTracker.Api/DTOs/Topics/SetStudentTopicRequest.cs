namespace DiplomaTracker.Api.DTOs.Topics;

public class SetStudentTopicRequest
{
    /// <summary>The topic to give the student, or null to leave them without one.</summary>
    public Guid? TopicId { get; set; }
}
