/**
 * User service interface
 * Abstracts user operations for both mock/SQLite and Cognito backends
 */

export interface User {
  id: string;
  email: string;
  name: string;
  groups: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}

export interface UserServiceResult<T> {
  success: true;
  data: T;
}

export interface UserServiceError {
  success: false;
  error: UserErrorCode;
  message: string;
}

export type UserErrorCode =
  | 'email_exists'
  | 'user_not_found'
  | 'invalid_password'
  | 'invalid_email'
  | 'weak_password'
  | 'operation_failed';

export type UserResult<T> = UserServiceResult<T> | UserServiceError;

export interface UserService {
  /**
   * Register a new user
   */
  register(input: CreateUserInput): Promise<UserResult<User>>;

  /**
   * Update user profile (name, email)
   */
  updateProfile(userId: string, input: UpdateProfileInput): Promise<UserResult<User>>;

  /**
   * Change user password
   */
  changePassword(userId: string, input: ChangePasswordInput): Promise<UserResult<void>>;

  /**
   * Find user by email
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find user by ID
   */
  findById(userId: string): Promise<User | null>;

  /**
   * Verify credentials (for login)
   */
  verifyCredentials(email: string, password: string): Promise<User | null>;
}
