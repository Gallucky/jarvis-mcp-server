export interface OverallStats {
  total: number;
  done: number;
}

export interface SectionStats {
  section: string;
  total: number;
  done: number;
}

export interface TopicStats {
  section: string;
  zone: string;
  topic: string;
  total: number;
  done: number;
  remaining: number;
}

export interface LessonStats {
  lesson_number: number;
  total: number;
  done: number;
  note_path: string | null;
}

export interface Stats {
  overall: OverallStats;
  bySection: SectionStats[];
  byTopic: TopicStats[];
  byLesson: LessonStats[];
}