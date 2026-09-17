export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export const PASSWORD_POLICY_MESSAGE = `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`

export function isPasswordLengthValid(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX
}
