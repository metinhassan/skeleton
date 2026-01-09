export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];

  if (!username || username.trim().length === 0) {
    errors.push('Username is required');
  } else if (username.length < 3) {
    errors.push('Username must be at least 3 characters');
  } else if (username.length > 50) {
    errors.push('Username must be less than 50 characters');
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }

  return { valid: errors.length === 0, errors };
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (!password || password.length === 0) {
    errors.push('Password is required');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  return { valid: errors.length === 0, errors };
}

export function validateCredentials(username: string, password: string): ValidationResult {
  const usernameResult = validateUsername(username);
  const passwordResult = validatePassword(password);

  return {
    valid: usernameResult.valid && passwordResult.valid,
    errors: [...usernameResult.errors, ...passwordResult.errors],
  };
}
