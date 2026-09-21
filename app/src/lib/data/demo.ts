/**
 * Demo fixtures.
 *
 * Used ONLY when the database is not configured (local preview, static harness)
 * or for the explicitly labelled demo seed. Every public surface that renders
 * this data marks it with `misc.demoData` so nothing ever looks like real
 * platform activity.
 */
import type { Locale } from "@/lib/i18n";

export interface Option {
  id: string;
  code: string;
  name: string;
}

export interface DemoTutor {
  id: string;
  slug: string;
  name: string;
  headline: string;
  qualification: string;
  subjects: string[];
  stages: string[];
  area: string;
  yearsExperience: number;
  pricePerHour: string;
  ratingAvg: string | null;
  ratingCount: number;
  completedLessons: number;
  teachesHome: boolean;
  teachesOnline: boolean;
  languages: string[];
  verified: boolean;
  bio: string;
}

const SUBJECTS: Record<Locale, [string, string][]> = {
  ar: [
    ["math", "الرياضيات"],
    ["arabic", "اللغة العربية"],
    ["english", "اللغة الإنجليزية"],
    ["science", "العلوم"],
    ["physics", "الفيزياء"],
    ["chemistry", "الكيمياء"],
    ["biology", "الأحياء"],
    ["social", "الدراسات الاجتماعية"],
    ["cs", "علوم الحاسوب"],
    ["islamic", "التربية الإسلامية"],
  ],
  en: [
    ["math", "Mathematics"],
    ["arabic", "Arabic"],
    ["english", "English"],
    ["science", "Science"],
    ["physics", "Physics"],
    ["chemistry", "Chemistry"],
    ["biology", "Biology"],
    ["social", "Social studies"],
    ["cs", "Computer science"],
    ["islamic", "Islamic studies"],
  ],
};

const STAGES: Record<Locale, [string, string][]> = {
  ar: [
    ["primary", "المرحلة الابتدائية"],
    ["intermediate", "المرحلة الإعدادية"],
    ["secondary", "المرحلة الثانوية"],
  ],
  en: [
    ["primary", "Primary"],
    ["intermediate", "Intermediate"],
    ["secondary", "Secondary"],
  ],
};

const AREAS: Record<Locale, [string, string][]> = {
  ar: [
    ["manama", "المنامة"],
    ["riffa", "الرفاع"],
    ["muharraq", "المحرق"],
    ["isa-town", "مدينة عيسى"],
    ["hamad-town", "مدينة حمد"],
    ["sitrah", "سترة"],
    ["budaiya", "البديع"],
    ["juffair", "الجفير"],
  ],
  en: [
    ["manama", "Manama"],
    ["riffa", "Riffa"],
    ["muharraq", "Muharraq"],
    ["isa-town", "Isa Town"],
    ["hamad-town", "Hamad Town"],
    ["sitrah", "Sitra"],
    ["budaiya", "Budaiya"],
    ["juffair", "Juffair"],
  ],
};

function options(locale: Locale, rows: [string, string][]): Option[] {
  return rows.map(([code, name]) => ({ id: `demo-${code}`, code, name }));
}

export function demoSubjects(locale: Locale): Option[] {
  return options(locale, SUBJECTS[locale]);
}

export function demoStages(locale: Locale): Option[] {
  return options(locale, STAGES[locale]);
}

export function demoAreas(locale: Locale): Option[] {
  return options(locale, AREAS[locale]);
}

/**
 * Tutors used by the static preview harness only. They are shaped like real
 * rows so components cannot tell the difference - but the harness labels the
 * page as demo data.
 */
export const DEMO_TUTORS: Record<Locale, DemoTutor[]> = {
  ar: [
    {
      id: "demo-1",
      slug: "mohammed-ali-math",
      name: "محمد علي",
      headline: "مدرّس رياضيات وفيزياء للمرحلة الثانوية",
      qualification: "بكالوريوس رياضيات — جامعة البحرين",
      subjects: ["الرياضيات", "الفيزياء"],
      stages: ["الثانوي"],
      area: "الرفاع",
      yearsExperience: 8,
      pricePerHour: "6.500",
      ratingAvg: "4.80",
      ratingCount: 24,
      completedLessons: 186,
      teachesHome: true,
      teachesOnline: true,
      languages: ["العربية", "الإنجليزية"],
      verified: true,
      bio: "أركّز على بناء الأساس قبل حل الامتحانات، وأتابع تقدم الطالب بتقرير أسبوعي مختصر لولي الأمر.",
    },
    {
      id: "demo-2",
      slug: "fatima-hassan-english",
      name: "فاطمة حسن",
      headline: "معلّمة لغة إنجليزية ومهارات الكتابة",
      qualification: "بكالوريوس آداب إنجليزي — جامعة البحرين",
      subjects: ["اللغة الإنجليزية"],
      stages: ["الإعدادي", "الثانوي"],
      area: "المنامة",
      yearsExperience: 5,
      pricePerHour: "5.000",
      ratingAvg: "4.60",
      ratingCount: 17,
      completedLessons: 121,
      teachesHome: false,
      teachesOnline: true,
      languages: ["العربية", "الإنجليزية"],
      verified: true,
      bio: "حصص مركّزة على المحادثة والكتابة، مع تدريب على نماذج الامتحانات الرسمية.",
    },
    {
      id: "demo-3",
      slug: "ahmed-juma-chemistry",
      name: "أحمد جمعة",
      headline: "مدرّس كيمياء وأحياء للمرحلة الثانوية",
      qualification: "بكالوريوس علوم — جامعة الخليج العربي",
      subjects: ["الكيمياء", "الأحياء"],
      stages: ["الثانوي"],
      area: "مدينة عيسى",
      yearsExperience: 11,
      pricePerHour: "7.500",
      ratingAvg: "4.90",
      ratingCount: 31,
      completedLessons: 240,
      teachesHome: true,
      teachesOnline: true,
      languages: ["العربية"],
      verified: true,
      bio: "خبرة في تحضير طلبة الثانوية العامة، مع ملخصات وتمارين لكل وحدة.",
    },
    {
      id: "demo-4",
      slug: "noor-abdulla-primary",
      name: "نور عبدالله",
      headline: "معلّمة صفوف ابتدائية وتأسيس قراءة",
      qualification: "دبلوم تربية — كلية البحرين للمعلمين",
      subjects: ["اللغة العربية", "الرياضيات"],
      stages: ["الابتدائي"],
      area: "المحرق",
      yearsExperience: 6,
      pricePerHour: "4.500",
      ratingAvg: null,
      ratingCount: 0,
      completedLessons: 0,
      teachesHome: true,
      teachesOnline: true,
      languages: ["العربية", "الإنجليزية"],
      verified: true,
      bio: "أسلوب مبني على اللعب والتكرار الذكي لبناء مهارات القراءة والحساب.",
    },
  ],
  en: [
    {
      id: "demo-1",
      slug: "mohammed-ali-math",
      name: "Mohammed Ali",
      headline: "Secondary-school mathematics and physics tutor",
      qualification: "BSc Mathematics — University of Bahrain",
      subjects: ["Mathematics", "Physics"],
      stages: ["Secondary"],
      area: "Riffa",
      yearsExperience: 8,
      pricePerHour: "6.500",
      ratingAvg: "4.80",
      ratingCount: 24,
      completedLessons: 186,
      teachesHome: true,
      teachesOnline: true,
      languages: ["Arabic", "English"],
      verified: true,
      bio: "I build the fundamentals before exam technique, and send a short weekly progress note to the parent.",
    },
    {
      id: "demo-2",
      slug: "fatima-hassan-english",
      name: "Fatima Hassan",
      headline: "English language and writing skills tutor",
      qualification: "BA English Literature — University of Bahrain",
      subjects: ["English"],
      stages: ["Intermediate", "Secondary"],
      area: "Manama",
      yearsExperience: 5,
      pricePerHour: "5.000",
      ratingAvg: "4.60",
      ratingCount: 17,
      completedLessons: 121,
      teachesHome: false,
      teachesOnline: true,
      languages: ["Arabic", "English"],
      verified: true,
      bio: "Focused sessions on conversation and writing, with practice on the official exam formats.",
    },
    {
      id: "demo-3",
      slug: "ahmed-juma-chemistry",
      name: "Ahmed Juma",
      headline: "Secondary chemistry and biology tutor",
      qualification: "BSc Science — Arabian Gulf University",
      subjects: ["Chemistry", "Biology"],
      stages: ["Secondary"],
      area: "Isa Town",
      yearsExperience: 11,
      pricePerHour: "7.500",
      ratingAvg: "4.90",
      ratingCount: 31,
      completedLessons: 240,
      teachesHome: true,
      teachesOnline: true,
      languages: ["Arabic"],
      verified: true,
      bio: "Eleven years preparing secondary students, with unit summaries and practice sets for every topic.",
    },
    {
      id: "demo-4",
      slug: "noor-abdulla-primary",
      name: "Noor Abdulla",
      headline: "Primary years and early reading tutor",
      qualification: "Teaching diploma — Bahrain Teachers College",
      subjects: ["Arabic", "Mathematics"],
      stages: ["Primary"],
      area: "Muharraq",
      yearsExperience: 6,
      pricePerHour: "4.500",
      ratingAvg: null,
      ratingCount: 0,
      completedLessons: 0,
      teachesHome: true,
      teachesOnline: true,
      languages: ["Arabic", "English"],
      verified: true,
      bio: "Play-based, high-repetition approach to build reading and number confidence.",
    },
  ],
};
