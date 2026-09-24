namespace DiplomaTracker.Api.Entities;

public enum DocumentEventKind
{
    Created,
    VersionAdded,
    Sent,
    Forwarded,
    Done,
    Rejected,
    Recalled
}
