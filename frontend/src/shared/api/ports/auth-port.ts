/**
 * 認証ポート（インターフェース）
 * 
 * Clean Architecture: Application層が定義するインターフェース
 * Infrastructure層（Amplify等）がこれを実装する
 * 
 * 依存性逆転の原則:
 * - Application層は抽象（このport）に依存
 * - Infrastructure層は抽象を実装
 */

export interface AuthUser {
  userId: string;
  username: string;
  email?: string;
}

export interface AuthSession {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
}

export interface SignInInput {
  username: string;
  password: string;
}

export interface SignUpInput {
  username: string;
  password: string;
  email: string;
}

/**
 * 認証ポート
 * 
 * 外部認証サービスとの通信を抽象化
 */
export interface AuthPort {
  /**
   * サインイン
   */
  signIn(input: SignInInput): Promise<AuthUser>;

  /**
   * サインアウト
   */
  signOut(): Promise<void>;

  /**
   * サインアップ
   */
  signUp(input: SignUpInput): Promise<{ isSignUpComplete: boolean; userId?: string }>;

  /**
   * サインアップ確認
   */
  confirmSignUp(username: string, code: string): Promise<boolean>;

  /**
   * 現在のユーザーを取得
   */
  getCurrentUser(): Promise<AuthUser | null>;

  /**
   * セッションを取得
   */
  getSession(): Promise<AuthSession | null>;

  /**
   * 認証済みかチェック
   */
  isAuthenticated(): Promise<boolean>;
}
