namespace DiplomaTracker.Api.DTOs.Workflow;

public sealed record StoredFileDownload(Stream Content, string ContentType, string FileName);
