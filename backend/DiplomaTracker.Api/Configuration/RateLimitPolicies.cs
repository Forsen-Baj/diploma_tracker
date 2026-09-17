namespace DiplomaTracker.Api.Configuration;

public static class RateLimitPolicies
{
    public const string Authentication = "authentication";
    public const int AuthenticationPermitLimit = 10;
    public static readonly TimeSpan AuthenticationWindow = TimeSpan.FromMinutes(1);
}
