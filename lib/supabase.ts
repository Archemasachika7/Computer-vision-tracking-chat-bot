import { createClient } from '@supabase/supabase-js';

// Fallback placeholders prevent build-time crash when env vars aren't set.
// Actual API calls will fail gracefully at runtime with auth/network errors.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL      ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
);

export type Role = 'user' | 'admin';

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: Role;
  created_at: string;
}

export type QuestionType = 'mcq' | 'msq' | 'integer';

export interface Quiz {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  is_published: boolean;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  type: QuestionType;
  points: number;
  order_index: number;
  correct_answer: string | null;
}

export interface QuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}
