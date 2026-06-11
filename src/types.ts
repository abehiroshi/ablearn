// ===== コンテンツのスキーマ =====
// 問題・解説は public/content/ 配下の JSON ファイルとして配置し、
// アプリ本体のロジックから分離する。ファイルを置いて index.json に
// 登録するだけでコンテンツを追加できる。

export type QuestionType = "choice" | "input" | "flashcard" | "order";

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  /** 解答後に表示する解説 */
  explanation?: string;
}

/** 選択式（4択など） */
export interface ChoiceQuestion extends BaseQuestion {
  type: "choice";
  question: string;
  choices: string[];
  /** choices 内の正解インデックス */
  answer: number;
}

/** 入力式（記述・一問一答） */
export interface InputQuestion extends BaseQuestion {
  type: "input";
  question: string;
  /** 正解として受理する表記のリスト（正規化して比較する） */
  answers: string[];
  placeholder?: string;
}

/** フラッシュカード（暗記・自己申告） */
export interface FlashcardQuestion extends BaseQuestion {
  type: "flashcard";
  front: string;
  back: string;
}

/** 並べ替え（語順整序など）。tokens は正しい順序で記述する */
export interface OrderQuestion extends BaseQuestion {
  type: "order";
  question: string;
  tokens: string[];
}

export type Question =
  | ChoiceQuestion
  | InputQuestion
  | FlashcardQuestion
  | OrderQuestion;

/** 問題セット（1ファイル = 1セット） */
export interface QuestionSet {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

// ===== コンテンツ目次（content/index.json） =====

export interface SetMeta {
  id: string;
  name: string;
  /** content/ からの相対パス */
  file: string;
}

export interface Unit {
  id: string;
  name: string;
  sets: SetMeta[];
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  icon: string;
  units: Unit[];
}

export interface ContentIndex {
  /** 表示用の学年などの説明 */
  title?: string;
  subjects: Subject[];
}
