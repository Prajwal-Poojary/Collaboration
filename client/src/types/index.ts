export interface User {
    _id: string;
    name: string;
    email: string;
    role: 'host' | 'participant';
    token: string;
}

export interface AuthState {
    user: User | null;
    isLoading: boolean;
    error: string | null;
}
