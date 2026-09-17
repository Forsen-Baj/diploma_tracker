namespace DiplomaTracker.Api.Entities;

public class PlatformSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public bool RegistrationOpen { get; set; }
}
