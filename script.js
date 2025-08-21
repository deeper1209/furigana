// DOM 요소들
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const inputText = document.getElementById('inputText');
const convertBtn = document.getElementById('convertBtn');
const resultContainer = document.getElementById('resultContainer');
const copyBtn = document.getElementById('copyBtn');
const fontSizeSlider = document.getElementById('fontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const furiganaSizeSlider = document.getElementById('furiganaSize');
const furiganaSizeValue = document.getElementById('furiganaSizeValue');
const furiganaFormat = document.getElementById('furiganaFormat');
const furiganaColor = document.getElementById('furiganaColor');

// 새로운 DOM 요소들
const cameraBtn = document.getElementById('cameraBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');
const exportOptions = document.querySelectorAll('.export-option');
const screenshotBtn = document.getElementById('screenshotBtn');
let kuroInstance = null; // Kuroshiro instance cache
let sessionUserDict = {}; // Per-input temporary dictionary from user-provided bracket readings

// 형태소 분석기(kuromoji) 준비 - 사용 가능 시 자동 사용
let tokenizer = null;
if (typeof window !== 'undefined' && window.kuromoji && window.kuromoji.builder) {
    try {
        window.kuromoji
            .builder({ dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' })
            .build((err, tk) => {
                if (!err) tokenizer = tk;
            });
    } catch (_) {}
}

async function ensureKuroshiroReady() {
    if (kuroInstance) return kuroInstance;
    if (typeof window === 'undefined') return null;
    const KuroClass = window.Kuroshiro; // provided by CDN script
    const AnalyzerClass = window.KuroshiroAnalyzerKuromoji;
    if (!KuroClass || !AnalyzerClass) return null;
    try {
        kuroInstance = new KuroClass();
        const analyzer = new AnalyzerClass({ dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' });
        await kuroInstance.init(analyzer);
        return kuroInstance;
    } catch (_) {
        kuroInstance = null;
        return null;
    }
}

// 설정 상태 (로컬 스토리지에서 불러오기)
let settings = JSON.parse(localStorage.getItem('furiganaSettings')) || {
    fontSize: 16,
    furiganaSize: 12,
    format: 'ruby',
    color: 'black'
};
 

// 설정 모달 제어
settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'block';
    updateSettingsUI();
});

closeSettings.addEventListener('click', () => {
    settingsModal.style.display = 'none';
    saveSettings();
});

// 모달 외부 클릭으로 닫기
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
        saveSettings();
    }
});

// 설정 UI 업데이트
function updateSettingsUI() {
    fontSizeSlider.value = settings.fontSize;
    fontSizeValue.textContent = settings.fontSize;
    furiganaSizeSlider.value = settings.furiganaSize;
    furiganaSizeValue.textContent = settings.furiganaSize;
    furiganaFormat.value = settings.format;
    furiganaColor.value = settings.color;
    
}

// 설정 저장
function saveSettings() {
    localStorage.setItem('furiganaSettings', JSON.stringify(settings));
}

// 설정 변경 이벤트
fontSizeSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    fontSizeValue.textContent = value;
    settings.fontSize = parseInt(value);
    applySettings();
    applyFuriganaFontSize(settings.furiganaSize);
});

furiganaSizeSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    furiganaSizeValue.textContent = value;
    settings.furiganaSize = parseInt(value);
    applySettings();
    applyFuriganaFontSize(settings.furiganaSize);
});

furiganaFormat.addEventListener('change', (e) => {
    settings.format = e.target.value;
    // 형식 변경은 마크업 구조가 바뀌므로 재변환 필요
    if (resultContainer.innerHTML !== '<p class="placeholder">변환된 결과가 여기에 표시됩니다.</p>') {
        convertFurigana();
    }
});

furiganaColor.addEventListener('change', (e) => {
    settings.color = e.target.value;
    applySettings();
});

function getReading(term) {
    return (sessionUserDict && sessionUserDict[term]) || furiganaDict[term];
}

// 설정 적용
function applySettings() {
    resultContainer.style.fontSize = `${settings.fontSize}px`;
    if (resultContainer.innerHTML !== '<p class="placeholder">변환된 결과가 여기에 표시됩니다.</p>') {
        // 색상 변경 시 전체 재적용 없이 클래스만 교체
        updateFuriganaColors(settings.color);
    }
}

// 삭제 기능
clearBtn.addEventListener('click', () => {
    if (confirm('입력된 모든 내용을 삭제하시겠습니까?')) {
        inputText.value = '';
        resultContainer.innerHTML = '<p class="placeholder">변환된 결과가 여기에 표시됩니다.</p>';
        copyBtn.style.display = 'none';
        exportBtn.style.display = 'none';
        screenshotBtn.style.display = 'none';
    }
});

// 카메라 기능
cameraBtn.addEventListener('click', () => {
    alert('카메라 기능은 현재 개발 중입니다. 텍스트를 직접 입력해주세요.');
});

// 내보내기 드롭다운
exportBtn.addEventListener('click', () => {
    exportMenu.classList.toggle('show');
});

// 드롭다운 외부 클릭으로 닫기
document.addEventListener('click', (e) => {
    if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
        exportMenu.classList.remove('show');
    }
});

// 내보내기 옵션들
exportOptions.forEach(option => {
    option.addEventListener('click', () => {
        const format = option.dataset.format;
        exportResult(format);
        exportMenu.classList.remove('show');
    });
});

// 내보내기 기능
function exportResult(format) {
    const text = resultContainer.innerText;
    const title = '후리가나 변환 결과';
    
    switch (format) {
        case 'pdf':
            exportToPDF(text, title);
            break;
        case 'docx':
            exportToWord(text, title);
            break;
        case 'html':
            exportToHTML(text, title);
            break;
    }
}

// PDF 내보내기
function exportToPDF(text, title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(title, 20, 20);
    
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 20, 40);
    
    doc.save('후리가나_결과.pdf');
}

// Word 문서 내보내기
function exportToWord(text, title) {
    const content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>${title}</title>
        </head>
        <body>
            <h1>${title}</h1>
            <div style='white-space: pre-wrap;'>${text}</div>
        </body>
        </html>
    `;
    
    const blob = new Blob([content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '후리가나_결과.doc';
    a.click();
    URL.revokeObjectURL(url);
}

// HTML 내보내기
function exportToHTML(text, title) {
    const content = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                h1 { color: #333; border-bottom: 2px solid #ffb7c5; padding-bottom: 10px; }
                .content { margin-top: 30px; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <div class="content">${text}</div>
        </body>
        </html>
    `;
    
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '후리가나_결과.html';
    a.click();
    URL.revokeObjectURL(url);
}

// 스크린샷 기능
screenshotBtn.addEventListener('click', () => {
    html2canvas(resultContainer, {
        backgroundColor: '#f9f9f9',
        scale: 2,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = '후리가나_결과.png';
        link.href = canvas.toDataURL();
        link.click();
    });
});

// 개선된 후리가나 사전
const furiganaDict = {
    // 기본 단어들
    '漢字': 'かんじ',
    '日本語': 'にほんご',
    '勉強': 'べんきょう',
    '学校': 'がっこう',
    '先生': 'せんせい',
    '学生': 'がくせい',
    '友達': 'ともだち',
    '家族': 'かぞく',
    '会社': 'かいしゃ',
    '仕事': 'しごと',
    '時間': 'じかん',
    '今日': 'きょう',
    '明日': 'あした',
    '昨日': 'きのう',
    '年': 'とし',
    '月': 'つき',
    '日': 'ひ',
    '人': 'ひと',
    '国': 'くに',
    '世界': 'せかい',
    '日本': 'にほん',
    '韓国': 'かんこく',
    '中国': 'ちゅうごく',
    '朝日': 'あさひ',
    '新聞': 'しんぶん',
    '朝日新聞': 'あさひしんぶん',
    'アメリカ': 'アメリカ',
    '英語': 'えいご',
    '韓国語': 'かんこくご',
    '中国語': 'ちゅうごくご',
    '読書': 'どくしょ',
    '音楽': 'おんがく',
    '映画': 'えいが',
    '料理': 'りょうり',
    '旅行': 'りょこう',
    '趣味': 'しゅみ',
    '運動': 'うんどう',
    '健康': 'けんこう',
    '病気': 'びょうき',
    '病院': 'びょういん',
    '薬': 'くすり',
    '電話': 'でんわ',
    '携帯': 'けいたい',
    'パソコン': 'パソコン',
    'インターネット': 'インターネット',
    'メール': 'メール',
    '住所': 'じゅうしょ',
    '名前': 'なまえ',
    '年齢': 'ねんれい',
    '誕生日': 'たんじょうび',
    '結婚': 'けっこん',
    '子供': 'こども',
    '親': 'おや',
    '兄弟': 'きょうだい',
    '姉妹': 'しまい',
    '祖父': 'そふ',
    '祖母': 'そぼ',
    '叔父': 'おじ',
    '叔母': 'おば',
    '甥': 'おい',
    '姪': 'めい',
    '夫': 'おっと',
    '妻': 'つま',
    '息子': 'むすこ',
    '娘': 'むすめ',
    '犬': 'いぬ',
    '猫': 'ねこ',
    '鳥': 'とり',
    '魚': 'さかな',
    '花': 'はな',
    '木': 'き',
    '山': 'やま',
    '川': 'かわ',
    '海': 'うみ',
    '空': 'そら',
    '太陽': 'たいよう',
    '星': 'ほし',
    '雨': 'あめ',
    '雪': 'ゆき',
    '風': 'かぜ',
    '雲': 'くも',
    '春': 'はる',
    '夏': 'なつ',
    '秋': 'あき',
    '冬': 'ふゆ',
    '朝': 'あさ',
    '昼': 'ひる',
    '夜': 'よる',
    '午前': 'ごぜん',
    '午後': 'ごご',
    '今': 'いま',
    '昔': 'むかし',
    '未来': 'みらい',
    '過去': 'かこ',
    '現在': 'げんざい',
    '歴史': 'れきし',
    '文化': 'ぶんか',
    '伝統': 'でんとう',
    '現代': 'げんだい',
    '社会': 'しゃかい',
    '政治': 'せいじ',
    '経済': 'けいざい',
    '教育': 'きょういく',
    '科学': 'かがく',
    '技術': 'ぎじゅつ',
    '芸術': 'げいじゅつ',
    '文学': 'ぶんがく',
    '哲学': 'てつがく',
    '宗教': 'しゅうきょう',
    '道徳': 'どうとく',
    '法律': 'ほうりつ',
    '警察': 'けいさつ',
    '裁判': 'さいばん',
    '犯罪': 'はんざい',
    '平和': 'へいわ',
    '戦争': 'せんそう',
    '自由': 'じゆう',
    '平等': 'びょうどう',
    '民主': 'みんしゅ',
    '独裁': 'どくさい',
    '革命': 'かくめい',
    '改革': 'かいかく',
    '進歩': 'しんぽ',
    '発展': 'はってん',
    '成長': 'せいちょう',
    '変化': 'へんか',
    '改善': 'かいぜん',
    '解決': 'かいけつ',
    '問題': 'もんだい',
    '困難': 'こんなん',
    '成功': 'せいこう',
    '失敗': 'しっぱい',
    '努力': 'どりょく',
    '才能': 'さいのう',
    '能力': 'のうりょく',
    '知識': 'ちしき',
    '経験': 'けいけん',
    '技能': 'ぎのう',
    '資格': 'しかく',
    '免許': 'めんきょ',
    '証明': 'しょうめい',
    '確認': 'かくにん',
    '調査': 'ちょうさ',
    '研究': 'けんきゅう',
    '実験': 'じっけん',
    '分析': 'ぶんせき',
    '結果': 'けっか',
    '原因': 'げんいん',
    '影響': 'えいきょう',
    '効果': 'こうか',
    '利益': 'りえき',
    '損失': 'そんしつ',
    '収入': 'しゅうにゅう',
    '支出': 'ししゅつ',
    '貯金': 'ちょきん',
    '投資': 'とうし',
    '貯蓄': 'ちょちく',
    '節約': 'せつやく',
    '浪費': 'ろうひ',
    '財政': 'ざいせい',
    '予算': 'よさん',
    '決算': 'けっさん',
    '会計': 'かいけい',
    '税務': 'ぜいむ',
    '税金': 'ぜいきん',
    '給料': 'きゅうりょう',
    '給与': 'きゅうよ',
    '賃金': 'ちんぎん',
    '報酬': 'ほうしゅう',
    'ボーナス': 'ボーナス',
    '退職': 'たいしょく',
    '定年': 'ていねん',
    '年金': 'ねんきん',
    '保険': 'ほけん',
    '医療': 'いりょう',
    '診療': 'しんりょう',
    '治療': 'ちりょう',
    '手術': 'しゅじゅつ',
    '入院': 'にゅういん',
    '退院': 'たいいん',
    '通院': 'つういん',
    '検診': 'けんしん',
    '健康診断': 'けんこうしんだん',
    '予防': 'よぼう',
    'ワクチン': 'ワクチン',
    '感染': 'かんせん',
    '伝染': 'でんせん',
    '免疫': 'めんえき',
    '抗体': 'こうたい',
    '症状': 'しょうじょう',
    '発熱': 'はつねつ',
    '頭痛': 'ずつう',
    '腹痛': 'ふくつう',
    '咳': 'せき',
    '鼻水': 'はなみず',
    '下痢': 'げり',
    '嘔吐': 'おうと',
    'めまい': 'めまい',
    '疲労': 'ひろう',
    'ストレス': 'ストレス',
    '不安': 'ふあん',
    '緊張': 'きんちょう',
    '興奮': 'こうふん',
    '怒り': 'いかり',
    '悲しみ': 'かなしみ',
    '喜び': 'よろこび',
    '愛情': 'あいじょう',
    '友情': 'ゆうじょう',
    '親愛': 'しんあい',
    '尊敬': 'そんけい',
    '信頼': 'しんらい',
    '信用': 'しんよう',
    '約束': 'やくそく',
    '責任': 'せきにん',
    '義務': 'ぎむ',
    '権利': 'けんり',
    '西': 'にし',
    '海上': 'かいじょう',
    '台風': 'たいふう',
    '号': 'ごう',
    '発生': 'はっせい',
    '九州': 'きゅうしゅう',
    '非常': 'ひじょう',
    '激しい': 'はげしい',
    '大雨': 'おおあめ',
    '恐れ': 'おそれ',
    '特に': 'とくに',
    '奄美地方': 'あまみちほう',
    '除く': 'のぞく',
    '夕方': 'ゆうがた',
    '線状降水帯': 'せんじょうこうすいたい',
    '大雨災害': 'おおあめさいがい',
    '危険度': 'きけんど',
    '急激': 'きゅうげき',
    '高まる': 'たかまる',
    '可能性': 'かのうせい',

    // 뉴스/치안·법률 도메인 보강
    '警視庁': 'けいしちょう',
    '警察': 'けいさつ',
    '勤務': 'きんむ',
    '通勤': 'つうきん',
    '同行': 'どうこう',
    '容疑者': 'ようぎしゃ',
    '現行犯': 'げんこうはん',
    '現行犯逮捕': 'げんこうはんたいほ',
    '逮捕': 'たいほ',
    '被害': 'ひがい',
    '相談': 'そうだん',
    '駅': 'えき',
    'ホーム': 'ホーム',
    '下半身': 'かはんしん',
    '犯': 'はん',
    '痴漢': 'ちかん',
    '妻': 'つま',
    '夫': 'おっと',
    '公休': 'こうきゅう',
    '半身': 'はんしん',
    '現行': 'げんこう',
    '警': 'けい',
    
    // 교육 관련
    '大学': 'だいがく',
    '高校': 'こうこう',
    '中学': 'ちゅうがく',
    '小学': 'しょうがく',
    '幼稚園': 'ようちえん',
    '教室': 'きょうしつ',
    '授業': 'じゅぎょう',
    '宿題': 'しゅくだい',
    '試験': 'しけん',
    '成績': 'せいせき',
    '卒業': 'そつぎょう',
    '入学': 'にゅうがく',
    '転校': 'てんこう',
    '留学': 'りゅうがく',
    '論文': 'ろんぶん',
    '発表': 'はっぴょう',
    '討論': 'とうろん',
    '質問': 'しつもん',
    '回答': 'かいとう',
    '説明': 'せつめい',
    '理解': 'りかい',
    '記憶': 'きおく',
    '思考': 'しこう',
    '想像': 'そうぞう',
    '創造': 'そうぞう',
    '発明': 'はつめい',
    '発見': 'はっけん',
    '開発': 'かいはつ',
    '設計': 'せっけい',
    '製造': 'せいぞう',
    '生産': 'せいさん',
    '販売': 'はんばい',
    '購入': 'こうにゅう',
    '注文': 'ちゅうもん',
    '配送': 'はいそう',
    '配達': 'はいたつ',
    '包装': 'ほうそう',
    '梱包': 'こんぽう',
    '開封': 'かいふう',
    '使用': 'しよう',
    '利用': 'りよう',
    '活用': 'かつよう',
    '応用': 'おうよう',
    '実用': 'じつよう',
    '実践': 'じっせん',
    '実行': 'じっこう',
    '実施': 'じっし',
    '実現': 'じつげん',
    '実力': 'じつりょく',
    '実績': 'じっせき',
    '実感': 'じっかん',
    '実態': 'じったい',
    '実情': 'じつじょう',
    '実例': 'じつれい',
    '実話': 'じつわ',
    '実名': 'じつめい',
    '実家': 'じっか',
    '実業': 'じつぎょう',
    '実務': 'じつむ',
    '実習': 'じっしゅう',
    '実技': 'じつぎ',
    '実戦': 'じっせん',
    '実地': 'じっち',
    '実物': 'じつぶつ',
    '実費': 'じっぴ',
    '実額': 'じつがく',
    '実数': 'じっすう',
    '実質': 'じっしつ',
    '実際': 'じっさい',
    '実は': 'じつは',
    '実に': 'じつに',
    '実も': 'じつも',
    '実の': 'じつの',
    '実を': 'じつを',
    
    // 지명 관련
    '鹿児島県': 'かごしまけん',
    '薩摩川内': 'さつませんだい',
    '薩摩川内市': 'さつませんだいし',
    '東京都': 'とうきょうと',
    '大阪府': 'おおさかふ',
    '京都府': 'きょうとふ',
    '北海道': 'ほっかいどう',
    '沖縄県': 'おきなわけん',
    '福岡県': 'ふくおかけん',
    '愛知県': 'あいちけん',
    '神奈川県': 'かながわけん',
    '埼玉県': 'さいたまけん',
    '千葉県': 'ちばけん',
    '兵庫県': 'ひょうごけん',
    '静岡県': 'しずおかけん',
    '茨城県': 'いばらきけん',
    '群馬県': 'ぐんまけん',
    '栃木県': 'とちぎけん',
    '新潟県': 'にいがたけん',
    '長野県': 'ながのけん',
    '岐阜県': 'ぎふけん',
    '三重県': 'みえけん',
    '滋賀県': 'しがけん',
    '奈良県': 'ならけん',
    '和歌山県': 'わかやまけん',
    '鳥取県': 'とっとりけん',
    '島根県': 'しまねけん',
    '岡山県': 'おかやまけん',
    '広島県': 'ひろしまけん',
    '山口県': 'やまぐちけん',
    '徳島県': 'とくしまけん',
    '香川県': 'かがわけん',
    '愛媛県': 'えひめけん',
    '高知県': 'こうちけん',
    '福島県': 'ふくしまけん',
    '山形県': 'やまがたけん',
    '宮城県': 'みやぎけん',
    '秋田県': 'あきたけん',
    '青森県': 'あおもりけん',
    '岩手県': 'いわてけん',
    '山梨県': 'やまなしけん',
    '富山県': 'とやまけん',
    '石川県': 'いしかわけん',
    '福井県': 'ふくいけん',
    '九州': 'きゅうしゅう',
    '奄美地方': 'あまみちほう',
    
    // 날짜/시간 관련 단어들
    '今日': 'きょう',
    '明日': 'あした',
    '昨日': 'きのう',
    '今朝': 'けさ',
    '今晩': 'こんばん',
    '今月': 'こんげつ',
    '今年': 'ことし',
    '今度': 'こんど',
    '今週': 'こんしゅう',
    '午前': 'ごぜん',
    '午後': 'ごご',
    '夕方': 'ゆうがた',
    '台風': 'たいふう',
    '発生': 'はっせい',
    '大雨': 'おおあめ',
    '線状降水帯': 'せんじょうこうすいたい',
    '大雨災害': 'おおあめさいがい',
    '危険度': 'きけんど',
    '急激': 'きゅうげき',
    '高まる': 'たかまる',
    '可能性': 'かのうせい',
    '今日中': 'きょうじゅう',
    '明日中': 'あしたじゅう',
    '昨日中': 'きのうじゅう',
    '今日は': 'きょうは',
    '明日は': 'あしたは',
    '昨日は': 'きのうは',
    '今日も': 'きょうも',
    '明日も': 'あしたも',
    '昨日も': 'きのうも',
    '今日の': 'きょうの',
    '明日の': 'あしたの',
    '昨日の': 'きのうの',
    '今日に': 'きょうに',
    '明日に': 'あしたに',
    '昨日に': 'きのうに',
    '今日を': 'きょうを',
    '明日を': 'あしたを',
    '昨日を': 'きのうを',
    '今日が': 'きょうが',
    '明日が': 'あしたが',
    '昨日が': 'きのうが',
    '今日で': 'きょうで',
    '明日で': 'あしたで',
    '昨日で': 'きのうで',
    '今日と': 'きょうと',
    '明日と': 'あしたと',
    '昨日と': 'きのうと',
    '今日や': 'きょうや',
    '明日や': 'あしたや',
    '昨日や': 'きのうや',
    '今日か': 'きょうか',
    '明日か': 'あしたか',
    '昨日か': 'きのうか',
    '今日ね': 'きょうね',
    '明日ね': 'あしたね',
    '昨日ね': 'きのうね',
    '今日よ': 'きょうよ',
    '明日よ': 'あしたよ',
    '昨日よ': 'きのうよ',
    '今日さ': 'きょうさ',
    '明日さ': 'あしたさ',
    '昨日さ': 'きのうさ',
    '今日だ': 'きょうだ',
    '明日だ': 'あしただ',
    '昨日だ': 'きのうだ',
    '今日です': 'きょうです',
    '明日です': 'あしたです',
    '昨日です': 'きのうです',
    '今日でした': 'きょうでした',
    '明日でした': 'あしたでした',
    '昨日でした': 'きのうでした',
    '今日だった': 'きょうだった',
    '明日だった': 'あしただった',
    '昨日だった': 'きのうだった',
    '今日でしょう': 'きょうでしょう',
    '明日でしょう': 'あしたでしょう',
    '昨日でしょう': 'きのうでしょう',
    '今日かもしれません': 'きょうかもしれません',
    '明日かもしれません': 'あしたかもしれません',
    '昨日かもしれません': 'きのうかもしれません',
    '今日かもしれない': 'きょうかもしれない',
    '明日かもしれない': 'あしたかもしれない',
    '昨日かもしれない': 'きのうかもしれない',
    '今日でしょうね': 'きょうでしょうね',
    '明日でしょうね': 'あしたでしょうね',
    '昨日でしょうね': 'きのうでしょうね',
    '今日でしょうよ': 'きょうでしょうよ',
    '明日でしょうよ': 'あしたでしょうよ',
    '昨日でしょうよ': 'きのうでしょうよ',
    '今日でしょうさ': 'きょうでしょうさ',
    '明日でしょうさ': 'あしたでしょうさ',
    '昨日でしょうさ': 'きのうでしょうさ',
    '今日でしょうだ': 'きょうでしょうだ',
    '明日でしょうだ': 'あしたでしょうだ',
    '昨日でしょうだ': 'きのうでしょうだ',
    '今日でしょうです': 'きょうでしょうです',
    '明日でしょうです': 'あしたでしょうです',
    '昨日でしょうです': 'きのうでしょうです',
    '今日でしょうでした': 'きょうでしょうでした',
    '明日でしょうでした': 'あしたでしょうでした',
    '昨日でしょうでした': 'きのうでしょうでした',
    '今日でしょうだった': 'きょうでしょうだった',
    '明日でしょうだった': 'あしたでしょうだった',
    '昨日でしょうだった': 'きのうでしょうだった',
    '今日かもしれませんね': 'きょうかもしれませんね',
    '明日かもしれませんね': 'あしたかもしれませんね',
    '昨日かもしれませんね': 'きのうかもしれませんね',
    '今日かもしれませんよ': 'きょうかもしれませんよ',
    '明日かもしれませんよ': 'あしたかもしれませんよ',
    '昨日かもしれませんよ': 'きのうかもしれませんよ',
    '今日かもしれませんさ': 'きょうかもしれませんさ',
    '明日かもしれませんさ': 'あしたかもしれませんさ',
    '昨日かもしれませんさ': 'きのうかもしれませんさ',
    '今日かもしれませんだ': 'きょうかもしれませんだ',
    '明日かもしれませんだ': 'あしたかもしれませんだ',
    '昨日かもしれませんだ': 'きのうかもしれませんだ',
    '今日かもしれませんです': 'きょうかもしれませんです',
    '明日かもしれませんです': 'あしたかもしれませんです',
    '昨日かもしれませんです': 'きのうかもしれませんです',
    '今日かもしれませんでした': 'きょうかもしれませんでした',
    '明日かもしれませんでした': 'あしたかもしれませんでした',
    '昨日かもしれませんでした': 'きのうかもしれませんでした',
    '今日かもしれませんだった': 'きょうかもしれませんだった',
    '明日かもしれませんだった': 'あしたかもしれませんだった',
    '昨日かもしれませんだった': 'きのうかもしれませんだった'
};

// 단일 한자 기본 독음 폴백 (사전에 없는 경우 대비)
const kanjiFallbackReadings = {
    '一': 'いち', '二': 'に', '三': 'さん', '四': 'し', '五': 'ご', '六': 'ろく', '七': 'しち', '八': 'はち', '九': 'きゅう', '十': 'じゅう',
    '百': 'ひゃく', '千': 'せん', '万': 'まん', '円': 'えん',
    '人': 'ひと', '日': 'にち', '年': 'ねん', '月': 'げつ', '火': 'か', '水': 'すい', '木': 'もく', '金': 'きん', '土': 'ど',
    '時': 'じ', '分': 'ふん', '間': 'かん', '国': 'くに', '語': 'ご', '学': 'がく', '校': 'こう', '生': 'せい', '先': 'せん',
    '大': 'おお', '小': 'ちい', '中': 'なか', '上': 'うえ', '下': 'した',
    '本': 'ほん', '名': 'な', '前': 'まえ', '後': 'あと', '新': 'あたら', '古': 'ふる', '高': 'たか', '安': 'やす',
    '行': 'い', '来': 'き', '出': 'で', '入': 'い', '見': 'み', '言': 'い', '食': 'た', '飲': 'の', '買': 'か', '読': 'よ', '書': 'か', '聞': 'き', '話': 'はな', '思': 'おも', '知': 'し',
    '電': 'でん', '車': 'くるま', '駅': 'えき', '道': 'みち', '京': 'きょう', '東': 'ひがし', '西': 'にし', '南': 'みなみ', '北': 'きた',
    '海': 'うみ', '山': 'やま', '川': 'かわ', '空': 'そら', '雨': 'あめ', '雪': 'ゆき', '風': 'かぜ', '花': 'はな', '気': 'き', '天': 'てん',
    '体': 'からだ', '手': 'て', '足': 'あし', '口': 'くち', '目': 'め', '耳': 'みみ', '頭': 'あたま', '心': 'こころ',
    '父': 'ちち', '母': 'はは', '兄': 'あに', '姉': 'あね', '弟': 'おとうと', '妹': 'いもうと', '家': 'いえ', '族': 'ぞく',
    '白': 'しろ', '黒': 'くろ', '赤': 'あか', '青': 'あお', '緑': 'みどり', '黄': 'き',
    '週': 'しゅう', '朝': 'あさ', '昼': 'ひる', '夜': 'よる', '今': 'いま', '来': 'らい'
};

// 다자(複数漢字) 합성어를 위한 온음(음독) 우선 폴백
const kanjiOnyomiReadings = {
    '学': 'がく', '校': 'こう', '生': 'せい', '先': 'せん', '社': 'しゃ', '会': 'かい', '員': 'いん',
    '国': 'こく', '語': 'ご', '時': 'じ', '分': 'ぶん', '間': 'かん', '年': 'ねん', '月': 'げつ', '日': 'にち',
    '大': 'だい', '小': 'しょう', '中': 'ちゅう', '上': 'じょう', '下': 'か', '本': 'ほん', '名': 'めい',
    '前': 'ぜん', '後': 'こう', '新': 'しん', '古': 'こ', '高': 'こう', '安': 'あん',
    '行': 'こう', '来': 'らい', '出': 'しゅつ', '入': 'にゅう', '見': 'けん', '言': 'げん', '食': 'しょく', '飲': 'いん',
    '買': 'ばい', '読': 'どく', '書': 'しょ', '聞': 'ぶん', '話': 'わ', '思': 'し', '知': 'ち',
    '電': 'でん', '車': 'しゃ', '駅': 'えき', '道': 'どう', '京': 'きょう', '東': 'とう', '西': 'せい', '南': 'なん', '北': 'ほく',
    '海': 'かい', '山': 'さん', '川': 'せん', '空': 'くう', '雨': 'う', '雪': 'せつ', '風': 'ふう', '花': 'か', '気': 'き', '天': 'てん',
    '体': 'たい', '手': 'しゅ', '足': 'そく', '口': 'こう', '目': 'もく', '耳': 'じ', '頭': 'とう', '心': 'しん',
    '父': 'ふ', '母': 'ぼ', '兄': 'けい', '姉': 'し', '弟': 'てい', '妹': 'まい', '家': 'か', '族': 'ぞく',
    '白': 'はく', '黒': 'こく', '赤': 'せき', '青': 'せい', '緑': 'りょく', '黄': 'おう',
    '週': 'しゅう', '朝': 'ちょう', '昼': 'ちゅう', '夜': 'や', '今': 'こん', '来': 'らい'
};

function wrapWithFurigana(base, reading) {
    if (!reading) return base;
    if (settings.format === 'bracket') {
        return `${base}<span class="furigana-bracket furigana-${settings.color}" style="font-size: ${settings.furiganaSize}px;">(${reading})</span>`;
    }
    return `<ruby>${base}<rt class="furigana-ruby furigana-${settings.color}" style="font-size: ${settings.furiganaSize}px;">${reading}</rt></ruby>`;
}

// 한자 연속 구간을 긴 단어 우선으로 주석 처리, 없으면 단일 한자 폴백 적용
function annotateKanjiRun(runText) {
    let index = 0;
    let annotated = '';
    let lastReading = '';
    // 우선순위: 사용자 사전/내장 사전에 있는 가장 긴 항목 먼저 매칭
    // 성능: 길이가 긴 순서로 검사
    // 사전 키 프리셋
    const dictKeys = Object.keys(furiganaDict);
    const allKeys = [...dictKeys].sort((a,b) => b.length - a.length);
    while (index < runText.length) {
        let matched = false;
        // 사전에 존재하는 키 우선 그리디 매칭
        for (const key of allKeys) {
            if (key.length <= 1) continue;
            if (runText.startsWith(key, index)) {
                const reading = getReading(key);
                if (reading) {
                    annotated += wrapWithFurigana(key, reading);
                    lastReading = reading;
                    index += key.length;
                    matched = true;
                    break;
                }
            }
        }
        if (matched) continue;
        // 남은 경우 기존 길이 기반 그리디 (사전에 아직 없는 조합 대비)
        for (let len = runText.length - index; len >= 2; len--) {
            const sub = runText.substr(index, len);
            const reading = getReading(sub);
            if (reading) {
                annotated += wrapWithFurigana(sub, reading);
                lastReading = reading;
                index += len;
                matched = true;
                break;
            }
        }
        if (matched) continue;
        const ch = runText[index];
        if (ch === '々') {
            // 반복 부호: 직전 한자의 독음을 재사용
            const repeatReading = lastReading;
            annotated += repeatReading ? wrapWithFurigana(ch, repeatReading) : ch;
            index += 1;
            continue;
        }
        const remaining = runText.length - index;
        // 합성어(2글자 이상)에서는 사용자/온음 우선, 단일은 사용자/폴백 독음 우선
        const reading = remaining >= 2
            ? (furiganaDict[ch] || kanjiOnyomiReadings[ch] || kanjiFallbackReadings[ch])
            : (furiganaDict[ch] || kanjiFallbackReadings[ch] || kanjiOnyomiReadings[ch]);
        if (reading) {
            annotated += wrapWithFurigana(ch, reading);
            lastReading = reading;
        } else {
            annotated += ch;
            lastReading = '';
        }
        index += 1;
    }
    return annotated;
}

// 입력 텍스트에 이미 괄호형 후리가나가 있는 경우 제거 (중복 방지)
function stripExistingFuriganaFromPlainText(source) {
    if (!source) return source;
    let cleaned = source;
    // 1) 기존 루비 태그 제거: <ruby>漢字<rt>かな</rt></ruby> → 漢字
    cleaned = cleaned.replace(/<ruby>([\s\S]*?)<rt[\s\S]*?<\/rt><\/ruby>/gi, '$1');
    // 2) 괄호형 후리가나 제거: 漢字(かな) 또는 漢字（かな） → 漢字
    cleaned = cleaned.replace(/([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]+)\s*[\(（]([\u3040-\u30ffー]+)[\)）]/g, '$1');
    return cleaned;
}

// Harvest bracket readings from input to use as temporary hints for this conversion
function extractUserProvidedReadings(source) {
    const hints = {};
    if (!source) return hints;
    const re = /([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]+)\s*[\(（]([\u3040-\u30ffー]+)[\)）]/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const base = m[1];
        const rtRaw = m[2];
        const rt = katakanaToHiragana(rtRaw);
        if (!hints[base] || hints[base].length < rt.length) {
            hints[base] = rt;
        }
    }
    return hints;
}

// 개선된 후리가나 변환 함수 (긴 단어 우선 + 단일 한자 폴백)
function convertFurigana() {
    const text = inputText.value.trim();
    if (!text) {
        resultContainer.innerHTML = '<p class="placeholder">변환된 결과가 여기에 표시됩니다.</p>';
        copyBtn.style.display = 'none';
        exportBtn.style.display = 'none';
        screenshotBtn.style.display = 'none';
        return;
    }

    // 로딩 표시
    convertBtn.innerHTML = '<span class="loading"></span> 변환 중...';
    convertBtn.disabled = true;

    setTimeout(async () => {
        // Build ephemeral hints from user-provided bracket readings
        sessionUserDict = extractUserProvidedReadings(text);
        const cleaned = stripExistingFuriganaFromPlainText(text);
        let produced = '';
        // Try backend first (SudachiPy)
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            const base = (window.APP_CONFIG && window.APP_CONFIG.FURIGANA_API_BASE) || 'http://localhost:8000';
            const url = `${base}/api/furigana`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleaned, skip_kana: true }),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                produced = data && data.html ? data.html : '';
            }
        } catch (_) {
            // ignore and fallback
        }
        // 2) 서버 실패 시 Kuroshiro 우선 시도 (사전 추가 없이 폭넓게 커버)
        if (!produced) {
            const kuro = await ensureKuroshiroReady();
            if (kuro) {
                try {
                    const raw = await kuro.convert(cleaned, { to: 'hiragana', mode: 'furigana' });
                    const sanitized = sanitizeRubyHtml(raw, /*skipKana*/ true);
                    produced = injectHintsIntoRubyHtml(sanitized, sessionUserDict);
                } catch (_) {
                    produced = '';
                }
            }
        }
        // 3) 그래도 실패 시 토크나이저/사전 기반 보완 (오프라인에서도 동작)
        if (!produced) {
            if (tokenizer) {
                try {
                    let viaTokenizer = '';
                    const tokens = tokenizer.tokenize(cleaned);
                    for (const t of tokens) {
                        const surface = t.surface_form || '';
                        const hasKanji = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]/.test(surface);
                        const readingKatakana = (t.reading && t.reading !== '*')
                            ? t.reading
                            : ((t.pronunciation && t.pronunciation !== '*') ? t.pronunciation : '');
                        if (hasKanji) {
                            if (readingKatakana) {
                                viaTokenizer += tokenToRuby(surface, readingKatakana, /*skipKana*/ true);
                            } else {
                                const kanjiRun = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]+/g;
                                viaTokenizer += surface.replace(kanjiRun, (run) => annotateKanjiRun(run));
                            }
                        } else {
                            viaTokenizer += surface;
                        }
                    }
                    const ws = (s) => (s.match(/\s/g) || []).length;
                    const replaced = cleaned.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]+/g, (run) => annotateKanjiRun(run));
                    const tokenizerLooksBad = ws(viaTokenizer) < ws(cleaned) && ws(cleaned) > 0;
                    produced = tokenizerLooksBad ? replaced : viaTokenizer;
                } catch (_) {
                    produced = cleaned.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]+/g, (run) => annotateKanjiRun(run));
                }
            } else {
                produced = cleaned.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〻]+/g, (run) => annotateKanjiRun(run));
            }
        }
        let result = produced;
        if (settings.format === 'bracket' && produced) {
            result = transformRubyToBracket(produced, settings.furiganaSize, settings.color);
        }

        // 결과 표시
        resultContainer.innerHTML = result;
        updateFuriganaColors(settings.color);
        applyFuriganaFontSize(settings.furiganaSize);
        copyBtn.style.display = 'flex';
        exportBtn.style.display = 'flex';
        screenshotBtn.style.display = 'flex';
        
        // 버튼 복원
        convertBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 변환';
        convertBtn.disabled = false;
    }, 300);
}

// Katakana → Hiragana (kuromoji 읽기 결과를 변환)
function katakanaToHiragana(text) {
    return (text || '').replace(/[\u30A1-\u30F6]/g, (ch) => {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
}

// ===== Okurigana alignment helpers (ported idea from Sudachi-based approach) =====
const KANJI_REGEX = /[\u3400-\u9FFF]/;
const KANA_CLASS = '[\\u3040-\\u309F\\u30A0-\\u30FFー]';
const PREFIX_RE = new RegExp(`^${KANA_CLASS}+`);
const SUFFIX_RE = new RegExp(`${KANA_CLASS}+$`);
const STRIP_EDGES_RE = new RegExp(`^${KANA_CLASS}+|${KANA_CLASS}+$`, 'g');

function hasKanji(text) {
    return KANJI_REGEX.test(text);
}

function alignOkurigana(surface, readingHira) {
    const prefixMatch = surface.match(PREFIX_RE);
    const suffixMatch = surface.match(SUFFIX_RE);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const suffix = suffixMatch ? suffixMatch[0] : '';

    const prefixH = katakanaToHiragana(prefix);
    const suffixH = katakanaToHiragana(suffix);

    let coreReading = readingHira || '';
    if (prefixH && coreReading.startsWith(prefixH)) {
        coreReading = coreReading.slice(prefixH.length);
    }
    if (suffixH && coreReading.endsWith(suffixH)) {
        coreReading = coreReading.slice(0, coreReading.length - suffixH.length);
    }

    const kanjiCore = surface.replace(STRIP_EDGES_RE, '');
    return { prefix, kanjiCore, suffix, coreReading };
}

function tokenToRuby(surface, readingKatakana, skipKana = true) {
    const readingHira = katakanaToHiragana(readingKatakana || '');
    if (!readingHira) return surface;
    if (!hasKanji(surface)) {
        return skipKana ? surface : `<ruby><rb>${surface}</rb><rt>${readingHira}</rt></ruby>`;
    }
    const { prefix, kanjiCore, suffix, coreReading } = alignOkurigana(surface, readingHira);
    if (!kanjiCore || !coreReading) return surface;
    return `${prefix}<ruby><rb>${kanjiCore}</rb><rt>${coreReading}</rt></ruby>${suffix}`;
}

// ruby HTML 정리: 가나만으로 이루어진 베이스에는 루비 제거, 불필요 공백 정리
function sanitizeRubyHtml(html, skipKana = true) {
    if (!html) return html;
    const KANJI = /[\u3400-\u9FFF]/;
    // 1) <rb>가 있든 없든 모두 매칭하여 정리 루틴 실행
    return html.replace(/<ruby>\s*(?:<rb>)?([^<]+?)(?:<\/rb>)?\s*<rt[^>]*>\s*([^<]+?)\s*<\/rt>\s*<\/ruby>/g,
        (_m, base, rt) => {
            const trimmedBase = base.trim();
            const trimmedRt = rt.trim();
            const isKanaOnlyBase = !KANJI.test(trimmedBase);
            if (skipKana && isKanaOnlyBase) {
                return trimmedBase; // 가나/기호만이면 루비 제거
            }
            // 베이스와 읽기가 같으면 루비 제거
            if (trimmedBase === trimmedRt) {
                return trimmedBase;
            }
            return `<ruby>${trimmedBase}<rt>${trimmedRt}</rt></ruby>`;
        }
    );
}

// Inject user hints into ruby html produced by engines
function injectHintsIntoRubyHtml(html, hints) {
    if (!html || !hints) return html;
    return html.replace(/<ruby>\s*(?:<rb>)?([^<]+?)(?:<\/rb>)?\s*<rt[^>]*>\s*([^<]+?)\s*<\/rt>\s*<\/ruby>/g,
        (_m, base, rt) => {
            const trimmedBase = base.trim();
            const hinted = hints[trimmedBase];
            if (hinted && hinted !== rt) {
                return `<ruby>${trimmedBase}<rt>${hinted}</rt></ruby>`;
            }
            return `<ruby>${trimmedBase}<rt>${rt}</rt></ruby>`;
        }
    );
}

// ruby → 괄호형으로 변환 (rb 유무 모두 지원)
function transformRubyToBracket(html, sizePx, color) {
    const size = parseInt(sizePx) || 12;
    const safeColor = color || 'black';
    return html
        .replace(/<ruby>\s*(?:<rb>)?([^<]+?)(?:<\/rb>)?\s*<rt[^>]*>\s*([^<]+?)\s*<\/rt>\s*<\/ruby>/g,
            (_m, base, rt) => {
                return `${base}<span class="furigana-bracket furigana-${safeColor}" style="font-size: ${size}px;">(${rt})</span>`;
            }
        );
}

// 변환 버튼 이벤트
convertBtn.addEventListener('click', convertFurigana);

// Enter 키로 변환
inputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        convertFurigana();
    }
});

// 복사 버튼 기능
copyBtn.addEventListener('click', () => {
    const textToCopy = resultContainer.innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> 복사됨!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '#28a745';
        }, 2000);
    }).catch(err => {
        console.error('복사 실패:', err);
        alert('복사에 실패했습니다.');
    });
});

// 초기 설정 적용
updateSettingsUI();
applySettings();

// 색상 클래스 런타임 교체 유틸
function updateFuriganaColors(color) {
    const valid = new Set(['black', 'pink', 'blue', 'green']);
    if (!valid.has(color)) return;
    // 루비는 rt, 괄호 형식은 furigana-* 클래스를 가진 span만
    const targets = resultContainer.querySelectorAll('rt, span[class*="furigana-"]');
    targets.forEach(el => {
        // 기존 furigana-* 제거
        [...el.classList].forEach(cls => { if (cls.startsWith('furigana-')) el.classList.remove(cls); });
        el.classList.add(`furigana-${color}`);
    });
}

// 후리가나 글자 크기 적용 (루비 rt와 괄호 span 모두)
function applyFuriganaFontSize(sizePx) {
    const size = parseInt(sizePx);
    if (Number.isNaN(size)) return;
    // 루비 형식 rt
    const rts = resultContainer.querySelectorAll('rt');
    rts.forEach(rt => {
        rt.style.fontSize = `${size}px`;
    });
    // 괄호 형식 span
    const bracketSpans = resultContainer.querySelectorAll('span.furigana-bracket');
    bracketSpans.forEach(sp => {
        sp.style.fontSize = `${size}px`;
    });
}
