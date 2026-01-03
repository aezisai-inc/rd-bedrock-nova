/**
 * Amplify認証アダプター
 * 
 * Clean Architecture: Infrastructure層
 * AuthPortインターフェースをAmplifyで実装
 */
import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';
import type { AuthPort, AuthUser, AuthSession, SignInInput, SignUpInput } from '../../api/ports/auth-port';

/**
 * Amplify認証アダプター
 * 
 * ポートを実装し、Amplifyへの依存をカプセル化
 */
export class AmplifyAuthAdapter implements AuthPort {
  async signIn(input: SignInInput): Promise<AuthUser> {
    const result = await signIn({
      username: input.username,
      password: input.password,
    });

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

  async signOut(): Promise<void> {
    await signOut();
  }

  async signUp(input: SignUpInput): Promise<{ isSignUpComplete: boolean; userId?: string }> {
    const result = await signUp({
      username: input.username,
      password: input.password,
      options: {
        userAttributes: {
          email: input.email,
        },
      },
    });
    return {
      isSignUpComplete: result.isSignUpComplete,
      userId: result.userId,
    };
  }

  async confirmSignUp(username: string, code: string): Promise<boolean> {
    const result = await confirmSignUp({
      username,
      confirmationCode: code,
    });
    return result.isSignUpComplete;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
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

  async getSession(): Promise<AuthSession | null> {
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

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }
}

// シングルトンインスタンス
let instance: AmplifyAuthAdapter | null = null;

export function getAuthAdapter(): AuthPort {
  if (!instance) {
    instance = new AmplifyAuthAdapter();
  }
  return instance;
}
