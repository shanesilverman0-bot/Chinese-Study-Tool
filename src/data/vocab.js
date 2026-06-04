// Seed TOCFL vocabulary — Traditional Chinese only, pinyin with tone marks.
// Bands follow the TOCFL standard: Novice, A, B, C.
// This is a curated starter set bundled with the app so it works offline.
// The full ivankra/tocfl or nutchanonj/TOCFL_14425 lists can be imported
// at runtime via Settings → Import Vocabulary (see lib/vocab.js).
//
// Each entry: { id, hanzi, pinyin, english, band, tones }
// `tones` is an array of tone numbers (1-4, 5 = neutral) per syllable,
// used by the tone-curve visualizer to pick the reference contour.

export const SEED_VOCAB = [
  // ---- Novice ----
  { id: 'n001', hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello', band: 'Novice', tones: [3, 3] },
  { id: 'n002', hanzi: '謝謝', pinyin: 'xièxie', english: 'thank you', band: 'Novice', tones: [4, 5] },
  { id: 'n003', hanzi: '再見', pinyin: 'zàijiàn', english: 'goodbye', band: 'Novice', tones: [4, 4] },
  { id: 'n004', hanzi: '請', pinyin: 'qǐng', english: 'please; to invite', band: 'Novice', tones: [3] },
  { id: 'n005', hanzi: '對不起', pinyin: 'duìbùqǐ', english: 'sorry', band: 'Novice', tones: [4, 4, 3] },
  { id: 'n006', hanzi: '我', pinyin: 'wǒ', english: 'I; me', band: 'Novice', tones: [3] },
  { id: 'n007', hanzi: '你', pinyin: 'nǐ', english: 'you', band: 'Novice', tones: [3] },
  { id: 'n008', hanzi: '他', pinyin: 'tā', english: 'he; him', band: 'Novice', tones: [1] },
  { id: 'n009', hanzi: '老師', pinyin: 'lǎoshī', english: 'teacher', band: 'Novice', tones: [3, 1] },
  { id: 'n010', hanzi: '學生', pinyin: 'xuéshēng', english: 'student', band: 'Novice', tones: [2, 1] },
  { id: 'n011', hanzi: '朋友', pinyin: 'péngyǒu', english: 'friend', band: 'Novice', tones: [2, 3] },
  { id: 'n012', hanzi: '家', pinyin: 'jiā', english: 'home; family', band: 'Novice', tones: [1] },
  { id: 'n013', hanzi: '吃', pinyin: 'chī', english: 'to eat', band: 'Novice', tones: [1] },
  { id: 'n014', hanzi: '喝', pinyin: 'hē', english: 'to drink', band: 'Novice', tones: [1] },
  { id: 'n015', hanzi: '水', pinyin: 'shuǐ', english: 'water', band: 'Novice', tones: [3] },
  { id: 'n016', hanzi: '茶', pinyin: 'chá', english: 'tea', band: 'Novice', tones: [2] },
  { id: 'n017', hanzi: '愛', pinyin: 'ài', english: 'to love', band: 'Novice', tones: [4] },
  { id: 'n018', hanzi: '好', pinyin: 'hǎo', english: 'good', band: 'Novice', tones: [3] },
  { id: 'n019', hanzi: '大', pinyin: 'dà', english: 'big', band: 'Novice', tones: [4] },
  { id: 'n020', hanzi: '小', pinyin: 'xiǎo', english: 'small', band: 'Novice', tones: [3] },
  { id: 'n021', hanzi: '媽媽', pinyin: 'māma', english: 'mother', band: 'Novice', tones: [1, 5] },
  { id: 'n022', hanzi: '爸爸', pinyin: 'bàba', english: 'father', band: 'Novice', tones: [4, 5] },
  { id: 'n023', hanzi: '一', pinyin: 'yī', english: 'one', band: 'Novice', tones: [1] },
  { id: 'n024', hanzi: '是', pinyin: 'shì', english: 'to be', band: 'Novice', tones: [4] },
  { id: 'n025', hanzi: '不', pinyin: 'bù', english: 'not; no', band: 'Novice', tones: [4] },

  // ---- Band A ----
  { id: 'a001', hanzi: '學習', pinyin: 'xuéxí', english: 'to study; to learn', band: 'A', tones: [2, 2] },
  { id: 'a002', hanzi: '工作', pinyin: 'gōngzuò', english: 'work; job', band: 'A', tones: [1, 4] },
  { id: 'a003', hanzi: '時間', pinyin: 'shíjiān', english: 'time', band: 'A', tones: [2, 1] },
  { id: 'a004', hanzi: '喜歡', pinyin: 'xǐhuān', english: 'to like', band: 'A', tones: [3, 1] },
  { id: 'a005', hanzi: '覺得', pinyin: 'juéde', english: 'to feel; to think', band: 'A', tones: [2, 5] },
  { id: 'a006', hanzi: '知道', pinyin: 'zhīdào', english: 'to know', band: 'A', tones: [1, 4] },
  { id: 'a007', hanzi: '問題', pinyin: 'wèntí', english: 'question; problem', band: 'A', tones: [4, 2] },
  { id: 'a008', hanzi: '幫忙', pinyin: 'bāngmáng', english: 'to help', band: 'A', tones: [1, 2] },
  { id: 'a009', hanzi: '開始', pinyin: 'kāishǐ', english: 'to begin', band: 'A', tones: [1, 3] },
  { id: 'a010', hanzi: '希望', pinyin: 'xīwàng', english: 'to hope', band: 'A', tones: [1, 4] },
  { id: 'a011', hanzi: '便宜', pinyin: 'piányí', english: 'cheap', band: 'A', tones: [2, 2] },
  { id: 'a012', hanzi: '漂亮', pinyin: 'piàoliang', english: 'pretty', band: 'A', tones: [4, 5] },
  { id: 'a013', hanzi: '高興', pinyin: 'gāoxìng', english: 'happy', band: 'A', tones: [1, 4] },
  { id: 'a014', hanzi: '辦法', pinyin: 'bànfǎ', english: 'method; way', band: 'A', tones: [4, 3] },
  { id: 'a015', hanzi: '經常', pinyin: 'jīngcháng', english: 'often', band: 'A', tones: [1, 2] },

  // ---- Band B ----
  { id: 'b001', hanzi: '經濟', pinyin: 'jīngjì', english: 'economy', band: 'B', tones: [1, 4] },
  { id: 'b002', hanzi: '環境', pinyin: 'huánjìng', english: 'environment', band: 'B', tones: [2, 4] },
  { id: 'b003', hanzi: '影響', pinyin: 'yǐngxiǎng', english: 'to influence; impact', band: 'B', tones: [3, 3] },
  { id: 'b004', hanzi: '社會', pinyin: 'shèhuì', english: 'society', band: 'B', tones: [4, 4] },
  { id: 'b005', hanzi: '發展', pinyin: 'fāzhǎn', english: 'to develop', band: 'B', tones: [1, 3] },
  { id: 'b006', hanzi: '關係', pinyin: 'guānxì', english: 'relationship', band: 'B', tones: [1, 4] },
  { id: 'b007', hanzi: '能力', pinyin: 'nénglì', english: 'ability', band: 'B', tones: [2, 4] },
  { id: 'b008', hanzi: '機會', pinyin: 'jīhuì', english: 'opportunity', band: 'B', tones: [1, 4] },
  { id: 'b009', hanzi: '經驗', pinyin: 'jīngyàn', english: 'experience', band: 'B', tones: [1, 4] },
  { id: 'b010', hanzi: '習慣', pinyin: 'xíguàn', english: 'habit; to be used to', band: 'B', tones: [2, 4] },
  { id: 'b011', hanzi: '解決', pinyin: 'jiějué', english: 'to resolve', band: 'B', tones: [3, 2] },
  { id: 'b012', hanzi: '提供', pinyin: 'tígōng', english: 'to provide', band: 'B', tones: [2, 1] },

  // ---- Band C ----
  { id: 'c001', hanzi: '永續', pinyin: 'yǒngxù', english: 'sustainable', band: 'C', tones: [3, 4] },
  { id: 'c002', hanzi: '觀點', pinyin: 'guāndiǎn', english: 'viewpoint', band: 'C', tones: [1, 3] },
  { id: 'c003', hanzi: '趨勢', pinyin: 'qūshì', english: 'trend', band: 'C', tones: [1, 4] },
  { id: 'c004', hanzi: '策略', pinyin: 'cèlüè', english: 'strategy', band: 'C', tones: [4, 4] },
  { id: 'c005', hanzi: '矛盾', pinyin: 'máodùn', english: 'contradiction', band: 'C', tones: [2, 4] },
  { id: 'c006', hanzi: '評估', pinyin: 'pínggū', english: 'to assess', band: 'C', tones: [2, 1] },
  { id: 'c007', hanzi: '實施', pinyin: 'shíshī', english: 'to implement', band: 'C', tones: [2, 1] },
  { id: 'c008', hanzi: '突破', pinyin: 'túpò', english: 'breakthrough', band: 'C', tones: [2, 4] },
  { id: 'c009', hanzi: '潛力', pinyin: 'qiánlì', english: 'potential', band: 'C', tones: [2, 4] },
  { id: 'c010', hanzi: '彈性', pinyin: 'tánxìng', english: 'flexibility', band: 'C', tones: [2, 4] },
]

export const BANDS = ['Novice', 'A', 'B', 'C']

export const BAND_LABELS = {
  Novice: '入門',
  A: '基礎 A',
  B: '進階 B',
  C: '精通 C',
}
