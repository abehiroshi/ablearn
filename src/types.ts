// ===== コンテンツのスキーマ =====
// 問題・解説は public/content/ 配下の JSON ファイルとして配置し、
// アプリ本体のロジックから分離する。ファイルを置いて index.json に
// 登録するだけでコンテンツを追加できる。

export type QuestionType = "choice" | "input" | "flashcard" | "order";

/** 外部リンク（授業動画・解説サイトなど）。親が選定したものだけを入れる */
export interface ContentLink {
  label: string;
  url: string;
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  /** 解答後に表示する解説 */
  explanation?: string;
  /** 基本=1 / 標準=2 / 応用=3。未設定は標準（2）扱い */
  difficulty?: 1 | 2 | 3;
  /** 段階的ヒント。弱→強の順 */
  hints?: string[];
  /**
   * 概念ID。同じ concept を持つ問題群が1つの「概念ラダー」になる。
   * 変種は実行時生成ではなく、作成時に複数作って同じ concept に並べる
   */
  concept?: string;
  links?: ContentLink[];
}

/** 選択式（4択など） */
export interface ChoiceQuestion extends BaseQuestion {
  type: "choice";
  question: string;
  choices: string[];
  /** choices 内の正解インデックス */
  answer: number;
  /**
   * 受理表記のリスト。あれば同じ問題を習熟度に応じて
   * input（自力入力）形式でも出題できる
   */
  answers?: string[];
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

/** レッスンの解説カード */
export interface LessonCard {
  id: string;
  type: "card";
  title?: string;
  body: string;
}

/** レッスンのステップ: 解説カードか既存形式の問題 */
export type LessonStep = LessonCard | Question;

/** 問題セット（1ファイル = 1セット） */
export interface QuestionSet {
  id: string;
  title: string;
  description?: string;
  /** 未設定は演習。"lesson" は解説カード混在のステップ列 */
  kind?: "exercise" | "lesson";
  questions: Question[];
  /** kind: "lesson" のときのステップ列（questions の代わり） */
  steps?: LessonStep[];
}

// ===== コンテンツ目次（content/index.json） =====

export interface SetMeta {
  id: string;
  name: string;
  /** content/ からの相対パス */
  file: string;
  /** Library での見分けと出題対象の判定に使う */
  kind?: "lesson";
}

export interface Unit {
  id: string;
  name: string;
  sets: SetMeta[];
  /** 授業で使われている動画・解説サイトなどへの導線 */
  links?: ContentLink[];
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
