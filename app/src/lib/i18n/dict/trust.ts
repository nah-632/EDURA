import type { Dictionary } from "../types";

/**
 * Trust & identity copy: the About page, the Guarantee policy, and the trust
 * badges that carry the same message into the homepage and the tutor profile.
 *
 * Kept in its own module because these three surfaces are one story told at
 * three lengths (addendum §A-D): the badge is the claim, the homepage teaser is
 * the summary, and the About / Guarantee pages are the substance. Writing them
 * apart is how they drift into three disconnected pieces of marketing.
 *
 * Every claim here is a description of how the platform already works:
 * verification is the §7.2 approval flow, payment safety is the §13 state
 * machine, and the satisfaction rules are admin-configurable settings that the
 * guarantee page reads at render time. Nothing is promised that the code does
 * not do.
 */
export const trustCopy = {
  ar: {
    // --- About (من نحن) -----------------------------------------------------
    "about.kicker": "من نحن",
    "about.title": "منصة بحرينية، لطرفين من مجتمعنا",
    "about.intro":
      "إدورا منصة بحرينية بُنيت لخدمة طرفين من مجتمعنا: عائلات تبحث عن معلم خاص تثق به لأبنائها، وكفاءات بحرينية متخصصة في التعليم تبحث عن فرصة دخل حقيقية من خبرتها.",
    "about.badge": "منصة بحرينية بفخر",

    "about.families.title": "للعائلات",
    "about.families.lead": "ما نضمنه لولي الأمر قبل أن يحجز:",
    "about.families.p1": "لا يظهر أي معلم في نتائج البحث قبل التحقق اليدوي من مؤهله وهويته.",
    "about.families.p2": "السعر واضح قبل الحجز، والمبلغ يُحسب من سعر الساعة ومدة الحصة ونوع الدرس.",
    "about.families.p3": "لا يتم تثبيت الحجز قبل التحقق من الدفع، ويبقى لكل حجز رقم متابعة ومسار حالة يمكن الرجوع إليه.",
    "about.families.p4": "بيانات الطالب القاصر لا تظهر في أي صفحة عامة، وتُعرض للمعلم في حدود ما يلزم للحصة فقط.",

    "about.tutors.title": "للكفاءات التعليمية البحرينية",
    "about.tutors.lead": "كيف تدعم المنصة من يعلّم:",
    "about.tutors.p1": "خريجو كليات المعلمين والمعلمون المؤهلون يصلون إلى أسر تبحث عن مدرس في منطقتها أو عبر الإنترنت.",
    "about.tutors.p2": "الظهور في البحث باشتراك معلن، إضافة إلى عمولة {percent}٪ تُخصم من قيمة كل حصة مكتملة.",
    "about.tutors.p3": "شارة التحقق ليست ديكورًا: تعني أن المؤهل والهوية راجعا يدويًا، وهي ما يميّز ملفك عن الإعلانات العشوائية.",
    "about.tutors.p4": "لوحة معلم كاملة: الطلبات، الجدولة، الأرباح المتوقعة، الاشتراك، والمستندات في مكان واحد.",

    "about.closing":
      "نحن لا نبيع وعودًا: المنصة تنظّم البحث والتحقق والدفع والمتابعة، وتترك التعليم لمن يعرف كيف يعلّم. هذا ما نفعله اليوم، وسيتوسّع بما تسمح به تجربة الأسر والمعلمين معنا.",
    "about.cta.families": "ابحث عن معلم",
    "about.cta.tutors": "انضم كمدرس",

    // --- Guarantee (سياسة الضمان) -------------------------------------------
    "guarantee.kicker": "الثقة",
    "guarantee.title": "سياسة الضمان",
    "guarantee.intro":
      "الضمان هنا ليس شعارًا تسويقيًا، بل ثلاث قواعد مطبّقة في المنصة، وحدود معلنة بوضوح. كل بند أدناه يمكن التحقق منه من داخل الحجز نفسه.",

    "guarantee.verification.title": "ضمان التحقق قبل الظهور",
    "guarantee.verification.body":
      "لا يظهر أي ملف في نتائج البحث قبل أن يراجع فريق المنصة الهوية والمؤهل العلمي يدويًا. أي ملف لم يُعتمد لا يظهر، وأي ملف انتهى اشتراكه يختفي من البحث تلقائيًا حتى التجديد.",

    "guarantee.payment.title": "ضمان سلامة الدفع",
    "guarantee.payment.body":
      "لا يُثبَّت الحجز إلا بعد أن يتحقق مشرف من وصول المبلغ. الحجز يبقى بحالة «بانتظار الدفع» حتى ذلك الحين، وتُسجَّل كل عملية تحقق باسم من نفّذها ووقتها. لا تستلم المنصة بيانات بطاقتك: التحويل يتم عبر بنفت بي وإثباته يُرسل على واتساب.",

    "guarantee.satisfaction.title": "ضمان الرضا والاستبدال",
    "guarantee.satisfaction.body":
      "إذا لم تكن الحصة الأولى مطابقة لما هو معلن في الملف، يحق لولي الأمر طلب الاستبدال أو رصيد حصة بديلة خلال {hours} ساعة من انتهاء الحصة، ما دام لم تكتمل أكثر من {sessions} حصة مع المعلم نفسه ولم يُطلب التعويض عن الحصة نفسها سابقًا. الطلب يُراجع من فريق المنصة، والقرار يُبلَّغ خلال يوم عمل واحد.",

    "guarantee.notCovered.title": "ما لا يشمله الضمان",
    "guarantee.notCovered.lead": "نفضّل أن نكون صريحين:",
    "guarantee.notCovered.p1": "لا نضمن نتائج الاختبارات أو الدرجات؛ التحصيل يعتمد على الطالب والمتابعة المستمرة.",
    "guarantee.notCovered.p2": "لا يشمل الضمان الحصص التي لم يحضرها الطالب دون إبلاغ مسبق.",
    "guarantee.notCovered.p3": "لا يغطي الضمان اتفاقًا جرى بين الطرفين خارج المنصة ودون حجز موثّق.",

    "guarantee.claim.title": "كيف تقدّم طلبًا؟",
    "guarantee.claim.body":
      "من صفحة الحجز أو عبر واتساب المنصة مع رقم الطلب (EDU-…)، ونحتاج فقط وصفًا موجزًا لما حدث. يُنظر في الطلبات بحسب حالة الحجز وسجله، ويُبلَّغ مقدم الطلب بالنتيجة.",

    "guarantee.badge.verified": "معلمون مُتحقَّق منهم يدويًا",
    "guarantee.badge.payment": "لا تأكيد قبل التحقق من الدفع",
    "guarantee.badge.replacement": "استبدال أو رصيد خلال {hours} ساعة",
    "guarantee.reviewNote":
      "الشروط التجارية أعلاه قابلة للتعديل من إعدادات المنصة، والصياغة الملزمة تحتاج اعتماد مستشار قانوني مرخّص في البحرين قبل الإطلاق التجاري.",
    "guarantee.cta": "اقرأ سياسة الضمان",
    "profile.guaranteeBadge": "المؤهل والهوية تم التحقق منهما يدويًا قبل النشر",

    // --- Homepage teaser + badges ------------------------------------------
    "home.about.kicker": "من نحن",
    "home.about.title": "منصة بحرينية… لطرفين",
    "home.about.body":
      "نخدم عائلات تبحث عن معلم تثق به، وكفاءات بحرينية تعليمية تبحث عن دخل حقيقي من خبرتها. الاثنان في مكان واحد، بتحقق يدوي ودفع منظّم.",
    "home.about.families": "للعائلات: معلمون متحقق منهم وسعر واضح قبل الحجز.",
    "home.about.tutors": "للمعلمين: ظهور باشتراك معلن، إضافة إلى عمولة {percent}٪ من قيمة كل حصة مكتملة.",
    "home.about.link": "اقرأ المزيد عن إدورا",
    "home.guarantee.kicker": "الضمان",
    "home.guarantee.title": "ثلاث قواعد نبني عليها الثقة",
    "home.guarantee.body": "تحقق يدوي قبل الظهور، ولا تأكيد للحجز قبل التحقق من الدفع، واستبدال أو رصيد عند عدم الرضا.",
    "home.guarantee.link": "تفاصيل سياسة الضمان",

    // --- Privacy additions (addendum §B) -----------------------------------
    "legal.privacy.s8": "ملفات تعريف الارتباط والتتبع",
    "legal.privacy.s8.body":
      "نستخدم كوكي واحدًا ضروريًا لتسجيل الدخول (جلسة موقّعة، HttpOnly)، وكوكي تفضيل اللغة. لا نستخدم ملفات تتبع إعلانية ولا نبيع بيانات الزوار. أي إحصاء نستخدمه لاحقًا سيكون محليًا وبأقل قدر من البيانات، وسيُعلن هنا قبل تفعيله.",
    "legal.privacy.s9": "الأساس القانوني والمراجعة القانونية",
    "legal.privacy.s9.body":
      "تسعى هذه السياسة إلى التوافق مع قانون حماية البيانات الشخصية في مملكة البحرين (القانون رقم 30 لسنة 2018). الصياغة النهائية وبنود الأساس القانوني تحتاج مراجعة مستشار قانوني مرخّص في البحرين قبل النشر التجاري، ولا ندّعي التزامًا قانونيًا قبل هذه المراجعة.",
  },
  en: {
    // --- About --------------------------------------------------------------
    "about.kicker": "About us",
    "about.title": "A Bahraini platform, for two sides of our community",
    "about.intro":
      "Edura is a Bahraini platform built to serve two sides of our community: families looking for a private tutor they can trust, and qualified Bahraini education specialists looking for a real income opportunity from their expertise.",
    "about.badge": "Proudly Bahraini",

    "about.families.title": "For families",
    "about.families.lead": "What we guarantee before you book:",
    "about.families.p1": "No tutor appears in search before their qualification and identity have been verified by hand.",
    "about.families.p2": "The price is clear before booking, calculated from the hourly rate, lesson length and lesson type.",
    "about.families.p3": "A booking is never confirmed before the payment is verified, and every booking keeps a reference number and a status trail you can revisit.",
    "about.families.p4": "A minor student's details never appear on a public page, and are shown to the tutor only as far as the lesson needs.",

    "about.tutors.title": "For Bahraini teaching talent",
    "about.tutors.lead": "How the platform backs the people who teach:",
    "about.tutors.p1": "Graduates of teacher-training colleges and qualified educators reach families looking for a tutor in their area or online.",
    "about.tutors.p2": "Listing is a published subscription, plus a {percent}% commission taken from each completed lesson.",
    "about.tutors.p3": "The verification badge is not decoration: it means qualification and identity were reviewed by hand, and it is what separates your profile from random classifieds.",
    "about.tutors.p4": "A full tutor dashboard: requests, scheduling, expected earnings, subscription and documents in one place.",

    "about.closing":
      "We do not sell promises: the platform runs discovery, verification, payment and follow-up, and leaves teaching to people who know how to teach. That is what we do today, and it will grow at the pace families and tutors let it.",
    "about.cta.families": "Find a tutor",
    "about.cta.tutors": "Join as a tutor",

    // --- Guarantee ----------------------------------------------------------
    "guarantee.kicker": "Trust",
    "guarantee.title": "Guarantee policy",
    "guarantee.intro":
      "The guarantee here is not a marketing line: it is three rules the platform actually enforces, and a clearly stated set of limits. Every clause below can be checked from inside the booking itself.",

    "guarantee.verification.title": "Verified before listing",
    "guarantee.verification.body":
      "No profile appears in search before our team has reviewed identity and qualification by hand. An unapproved profile is not listed, and a profile whose subscription has lapsed disappears from search automatically until it is renewed.",

    "guarantee.payment.title": "Payment safety",
    "guarantee.payment.body":
      "A booking is never confirmed until an admin has verified that the money arrived. Until then the booking stays in \"awaiting payment\", and every verification is recorded with the name of the verifier and the time. The platform never receives your card details: the transfer happens through BenefitPay and the proof is sent on WhatsApp.",

    "guarantee.satisfaction.title": "Satisfaction and replacement",
    "guarantee.satisfaction.body":
      "If the first lesson does not match what the profile stated, the parent may request a replacement tutor or a credit for a substitute lesson within {hours} hours of the lesson ending, provided no more than {sessions} lesson has been completed with that tutor and no claim has already been made for the same lesson. Our team reviews the request and answers within one working day.",

    "guarantee.notCovered.title": "What the guarantee does not cover",
    "guarantee.notCovered.lead": "We would rather be plain about it:",
    "guarantee.notCovered.p1": "We do not guarantee exam results or grades; attainment depends on the student and on consistent follow-up.",
    "guarantee.notCovered.p2": "The guarantee does not cover lessons the student missed without prior notice.",
    "guarantee.notCovered.p3": "It does not cover any arrangement made privately between the two parties outside the platform and without a documented booking.",

    "guarantee.claim.title": "How to raise a claim",
    "guarantee.claim.body":
      "From the booking page, or on the platform WhatsApp with the booking number (EDU-…). We only need a short description of what happened. Requests are reviewed against the booking's state and history, and the outcome is reported to the person who raised it.",

    "guarantee.badge.verified": "Hand-verified tutors",
    "guarantee.badge.payment": "No confirmation before verified payment",
    "guarantee.badge.replacement": "Replacement or credit within {hours} hours",
    "guarantee.reviewNote":
      "The commercial terms above are editable from the platform settings, and the binding wording needs sign-off from a Bahrain-licensed legal advisor before commercial launch.",
    "guarantee.cta": "Read the guarantee policy",
    "profile.guaranteeBadge": "Qualification and identity verified by hand before listing",

    // --- Homepage teaser + badges ------------------------------------------
    "home.about.kicker": "About us",
    "home.about.title": "A Bahraini platform… for two sides",
    "home.about.body":
      "We serve families looking for a tutor they can trust, and Bahraini education specialists looking for real income from their expertise. Both in one place, with hand verification and organised payment.",
    "home.about.families": "For families: verified tutors and a clear price before you book.",
    "home.about.tutors": "For tutors: listing on a published subscription, plus a {percent}% commission on each completed lesson.",
    "home.about.link": "Read more about Edura",
    "home.guarantee.kicker": "Guarantee",
    "home.guarantee.title": "Three rules our trust is built on",
    "home.guarantee.body": "Hand verification before listing, no booking confirmed before the payment is verified, and a replacement or credit when a lesson disappoints.",
    "home.guarantee.link": "Guarantee policy details",

    // --- Privacy additions --------------------------------------------------
    "legal.privacy.s8": "Cookies and tracking",
    "legal.privacy.s8.body":
      "We use one necessary cookie for signing in (a signed, HttpOnly session) and one language-preference cookie. We use no advertising trackers and do not sell visitor data. Any measurement we add later will be local and minimal, and will be declared here before it is switched on.",
    "legal.privacy.s9": "Legal basis and legal review",
    "legal.privacy.s9.body":
      "This policy aims to align with the Kingdom of Bahrain's Personal Data Protection Law (Law No. 30 of 2018). The final wording and the legal-basis clauses need review by a Bahrain-licensed legal advisor before commercial publication, and we make no compliance claim ahead of that review.",
  },
} satisfies Record<"ar" | "en", Dictionary>;
