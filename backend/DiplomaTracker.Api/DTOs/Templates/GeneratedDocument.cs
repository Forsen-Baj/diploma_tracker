namespace DiplomaTracker.Api.DTOs.Templates;

public sealed record GeneratedDocument(byte[] Content, string FileName);

public sealed record TemplateSource(Stream Content, string FileName);
