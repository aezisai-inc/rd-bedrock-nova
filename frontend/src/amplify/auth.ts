/**
 * Amplify 認証フック
 * 
 * フロントエンド専用の認証ロジック
 */
import { 
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  type SignInInput,
  type SignUpInput,
} from 'aws-amplify/auth';

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

/**
 * サインイン
 */
export async function handleSignIn(input: SignInInput): Promise<AuthUser> {
  const result = await signIn(input);
  
  if (result.nextStep.signInStep === 'DONE') {
    const user = await getCurrentUser();
    return {
      userId: user.userId,
      username: user.username,
      email: user.signInDetails?.loginId,
    };
  }
  
  throw new Error(`Sign-in requires additional step: ${result.nextStep.signInStep}`);
}

/**
 * サインアウト
 */
export async function handleSignOut(): Promise<void> {
  await signOut();
}

/**
 * サインアップ
 */
export async function handleSignUp(input: SignUpInput): Promise<{ isSignUpComplete: boolean; userId?: string }> {
  const result = await signUp(input);
  return {
    isSignUpComplete: result.isSignUpComplete,
    userId: result.userId,
  };
}

/**
 * サインアップ確認
 */
export async function handleConfirmSignUp(username: string, confirmationCode: string): Promise<boolean> {
  const result = await confirmSignUp({
    username,
    confirmationCode,
  });
  return result.isSignUpComplete;
}

/**
 * 現在のユーザーを取得
 */
export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  try {
    const user = await getCurrentUser();
    return {
      userId: user.userId,
      username: user.username,
      email: user.signInDetails?.loginId,
    };
  } catch {
    return null;
  }
}

/**
 * 認証セッションを取得
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  try {
    const session = await fetchAuthSession();
    const tokens = session.tokens;
    
    if (!tokens?.accessToken || !tokens?.idToken) {
      return null;
    }
    
    return {
      accessToken: tokens.accessToken.toString(),
      idToken: tokens.idToken.toString(),
    };
  } catch {
    return null;
  }
}

/**
 * 認証済みかチェック
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getAuthenticatedUser();
  return user !== null;
}
