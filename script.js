// Global Application State
const AppState = {
    currentLanguage: 'en',
    currentQuestionIndex: 0,
    answers: [],
    userStage: null,
    translations: {},
    isLoading: true
};

// i18n System
class I18nManager {
    constructor() {
        this.currentLang = this.detectLanguage();
        this.translations = {};
        this.loadingPromises = {};
    }

    detectLanguage() {
        // Check URL parameter first (highest priority)
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && ['en', 'zh-TW'].includes(urlLang)) {
            return urlLang;
        }

        // Check localStorage (user's previous choice)
        const storedLang = localStorage.getItem('preferred-language');
        if (storedLang && ['en', 'zh-TW'].includes(storedLang)) {
            return storedLang;
        }

        // Check browser languages (more comprehensive)
        const browserLanguages = navigator.languages || [navigator.language || navigator.userLanguage];
        
        for (const lang of browserLanguages) {
            // Check for exact matches first
            if (lang === 'zh-TW' || lang === 'zh-Hant-TW' || lang === 'zh-Hant') {
                return 'zh-TW';
            }
            if (lang === 'en' || lang.startsWith('en-')) {
                return 'en';
            }
            
            // Check for broader Chinese language codes
            if (lang.startsWith('zh-TW') || lang.startsWith('zh-Hant') || 
                lang === 'zh-HK' || lang === 'zh-MO') {
                return 'zh-TW';
            }
            
            // Other Chinese variants default to Traditional Chinese for this site
            if (lang.startsWith('zh')) {
                return 'zh-TW';
            }
        }

        // Check timezone as additional hint for Chinese users
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (timezone === 'Asia/Taipei' || timezone === 'Asia/Hong_Kong' || 
                timezone === 'Asia/Macau') {
                return 'zh-TW';
            }
        } catch (e) {
            // Timezone detection failed, continue with default
        }

        return 'en'; // Default to English
    }

    async loadTranslations(lang) {
        if (this.translations[lang]) {
            return this.translations[lang];
        }

        if (this.loadingPromises[lang]) {
            return this.loadingPromises[lang];
        }

        this.loadingPromises[lang] = fetch(`./lang/${lang}.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${lang} translations`);
                }
                return response.json();
            })
            .then(translations => {
                this.translations[lang] = translations;
                return translations;
            })
            .catch(error => {
                console.error(`Error loading ${lang} translations:`, error);
                // Fallback to English if available
                if (lang !== 'en' && this.translations['en']) {
                    return this.translations['en'];
                }
                throw error;
            });

        return this.loadingPromises[lang];
    }

    async changeLanguage(lang) {
        try {
            await this.loadTranslations(lang);
            this.currentLang = lang;
            
            // Update HTML lang attribute
            document.documentElement.lang = lang;
            
            // Store preference
            localStorage.setItem('preferred-language', lang);
            
            // Update URL without reload
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            window.history.replaceState({}, '', url);
            
            // Update UI
            this.updateUI();
            
            return true;
        } catch (error) {
            console.error('Failed to change language:', error);
            return false;
        }
    }

    updateUI() {
        const translations = this.translations[this.currentLang];
        if (!translations) return;

        // Update all elements with data-i18n attributes
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.getNestedTranslation(translations, key);
            
            if (translation) {
                // Handle different element types
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.placeholder = translation;
                } else if (element.tagName === 'IMG') {
                    element.alt = translation;
                } else {
                    element.textContent = translation;
                }
            }
        });

        // Update tooltips with data-i18n-tooltip attributes
        document.querySelectorAll('[data-i18n-tooltip]').forEach(element => {
            const key = element.getAttribute('data-i18n-tooltip');
            const translation = this.getNestedTranslation(translations, key);
            
            if (translation && element._tippy) {
                element._tippy.setContent(translation);
            } else if (translation) {
                element.setAttribute('data-tippy-content', translation);
                // Special handling for stage bubbles that use CSS ::after content
                if (element.classList.contains('stage-bubble')) {
                    // Force CSS to re-read the data-tippy-content attribute
                    element.style.setProperty('--stage-label', `'${translation}'`);
                }
            }
        });

        // Update language switcher active state
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
        });
        
        // Initialize stage bubble labels
        this.initializeStageBubbles(translations);

        // Update document title and meta description
        document.title = translations.title || document.title;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && translations.meta?.description) {
            metaDesc.setAttribute('content', translations.meta.description);
        }
    }

    getNestedTranslation(obj, key) {
        return key.split('.').reduce((o, k) => o?.[k], obj);
    }
    
    initializeStageBubbles(translations) {
        document.querySelectorAll('.stage-bubble[data-i18n-tooltip]').forEach(element => {
            const key = element.getAttribute('data-i18n-tooltip');
            const translation = this.getNestedTranslation(translations, key);
            
            if (translation) {
                element.setAttribute('data-tippy-content', translation);
                element.style.setProperty('--stage-label', `'${translation}'`);
            }
        });
    }

    t(key, fallback = key) {
        const translation = this.getNestedTranslation(this.translations[this.currentLang], key);
        return translation || fallback;
    }
}

// Assessment Logic
class AssessmentManager {
    constructor(i18n) {
        this.i18n = i18n;
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.questions = [];
    }

    loadQuestions() {
        const translations = this.i18n.translations[this.i18n.currentLang];
        this.questions = translations?.assessment?.questions || [];
        return this.questions;
    }

    renderQuestion(index) {
        const question = this.questions[index];
        if (!question) return;

        const container = document.getElementById('question-container');
        if (!container) return;

        container.innerHTML = `
            <div class="question active" data-question-id="${question.id}">
                <h3>${question.question}</h3>
                <div class="options">
                    ${question.options.map((option, optionIndex) => `
                        <button class="option" data-option-index="${optionIndex}">
                            ${option.text}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        // Add option click handlers
        container.querySelectorAll('.option').forEach(optionBtn => {
            optionBtn.addEventListener('click', (e) => {
                // Remove previous selections
                container.querySelectorAll('.option').forEach(btn => btn.classList.remove('selected'));
                
                // Select current option
                e.target.classList.add('selected');
                
                // Store answer
                const optionIndex = parseInt(e.target.dataset.optionIndex);
                this.selectAnswer(index, optionIndex);
                
                // Auto-advance to next question after a brief delay (except on last question)
                setTimeout(() => {
                    if (this.currentQuestionIndex < this.questions.length - 1) {
                        this.nextQuestion();
                    }
                    // On last question, just stay and let user click "Get Results" button
                }, 600); // 600ms delay to allow user to see their selection
            });
        });

        // Restore previous answer if exists
        const previousAnswer = this.answers[index];
        if (previousAnswer !== undefined) {
            const optionBtn = container.querySelector(`[data-option-index="${previousAnswer}"]`);
            if (optionBtn) {
                optionBtn.classList.add('selected');
            }
        }

        this.updateProgress();
        this.updateNavigationButtons();
    }

    selectAnswer(questionIndex, optionIndex) {
        this.answers[questionIndex] = optionIndex;
        this.updateNavigationButtons();
    }

    updateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill && progressText) {
            const progress = ((this.currentQuestionIndex + 1) / this.questions.length) * 100;
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${this.currentQuestionIndex + 1}/${this.questions.length}`;
        }
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prev-question');
        const nextBtn = document.getElementById('next-question');
        const finishBtn = document.getElementById('finish-assessment');

        if (prevBtn) {
            prevBtn.disabled = this.currentQuestionIndex === 0;
        }

        const hasAnswer = this.answers[this.currentQuestionIndex] !== undefined;
        const isLastQuestion = this.currentQuestionIndex === this.questions.length - 1;

        if (nextBtn && finishBtn) {
            // Hide next button since we auto-advance
            nextBtn.style.display = 'none';
            
            if (isLastQuestion) {
                finishBtn.style.display = hasAnswer ? 'inline-block' : 'none';
            } else {
                finishBtn.style.display = 'none';
            }
        }
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
            this.renderQuestion(this.currentQuestionIndex);
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderQuestion(this.currentQuestionIndex);
        }
    }

    calculateResults() {
        const stageScores = { stage1: 0, stage2: 0, stage3: 0, stage4: 0 };

        this.answers.forEach((answerIndex, questionIndex) => {
            const question = this.questions[questionIndex];
            const selectedOption = question.options[answerIndex];
            
            if (selectedOption && selectedOption.score) {
                Object.keys(selectedOption.score).forEach(stage => {
                    stageScores[stage] += selectedOption.score[stage];
                });
            }
        });

        // Find the stage with the highest score
        const maxStage = Object.keys(stageScores).reduce((a, b) => 
            stageScores[a] > stageScores[b] ? a : b
        );

        return {
            stage: maxStage,
            scores: stageScores,
            percentage: Math.round((stageScores[maxStage] / (this.questions.length * 3)) * 100)
        };
    }

    reset() {
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.loadQuestions();
    }
}

// Visualization Manager
class VisualizationManager {
    constructor() {
        this.charts = {};
        this.animations = {};
    }

    initParticles(containerId, config = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`Particles container ${containerId} not found`);
            return;
        }
        
        if (!window.particlesJS) {
            console.warn('Particles.js library not loaded');
            return;
        }

        // Ensure container has proper styling
        if (container.style.position !== 'absolute') {
            container.style.position = 'absolute';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.zIndex = '1';
        }

        const defaultConfig = {
            particles: {
                number: { 
                    value: 40, 
                    density: { enable: true, value_area: 1000 } 
                },
                color: { value: "#ffffff" },
                shape: { type: "circle" },
                opacity: { 
                    value: 0.4, 
                    random: true,
                    anim: {
                        enable: true,
                        speed: 1,
                        opacity_min: 0.1,
                        sync: false
                    }
                },
                size: { 
                    value: 3, 
                    random: true,
                    anim: {
                        enable: true,
                        speed: 2,
                        size_min: 0.5,
                        sync: false
                    }
                },
                line_linked: {
                    enable: true,
                    distance: 120,
                    color: "#ffffff",
                    opacity: 0.3,
                    width: 1
                },
                move: {
                    enable: true,
                    speed: 1,
                    direction: "none",
                    random: true,
                    straight: false,
                    out_mode: "bounce",
                    bounce: true,
                    attract: {
                        enable: false,
                        rotateX: 600,
                        rotateY: 1200
                    }
                }
            },
            interactivity: {
                detect_on: "canvas",
                events: {
                    onhover: { enable: true, mode: "grab" },
                    onclick: { enable: false }, // Disable click to prevent white background
                    resize: true
                },
                modes: {
                    grab: {
                        distance: 100,
                        line_linked: { opacity: 0.6 }
                    }
                }
            },
            retina_detect: true
        };

        const finalConfig = { ...defaultConfig, ...config };
        
        try {
            particlesJS(containerId, finalConfig);
            console.log(`Particles initialized for ${containerId}`);
        } catch (error) {
            console.error(`Failed to initialize particles for ${containerId}:`, error);
        }
    }

    createSkillsChart(canvasId, stage, scores) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) return;

        const container = canvas.parentElement;
        if (!container) return;

        // Wait for container to be visible and properly sized
        const createChart = () => {
            // Check if container has valid dimensions
            if (container.offsetWidth === 0 || container.offsetHeight === 0) {
                console.warn('Canvas container has invalid dimensions, retrying...');
                // Retry after a short delay
                setTimeout(createChart, 100);
                return;
            }

            // Wait a bit more to ensure container is fully settled
            setTimeout(() => {
                this.doCreateSkillsChart(canvasId, stage, scores, canvas, container);
            }, 50);
        };

        // Always wait for proper timing
        requestAnimationFrame(() => {
            setTimeout(createChart, 100);
        });
    }

    doCreateSkillsChart(canvasId, stage, scores, canvas, container) {

        // Validate canvas dimensions to prevent max size error
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const maxWidth = Math.min(containerWidth, 4096); // Browser max canvas size limit
        const maxHeight = Math.min(containerHeight, 4096);
        
        if (maxWidth < 50 || maxHeight < 50) {
            console.warn('Canvas dimensions too small, skipping chart creation');
            return;
        }

        // Clear any previous sizing
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.maxWidth = '';
        canvas.style.maxHeight = '';
        
        // Set the container to have a specific aspect ratio
        const aspectRatio = 1; // Square aspect ratio for radar chart
        const size = Math.min(containerWidth, containerHeight);
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        
        // Ensure canvas is visible and centered
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';

        // Destroy existing chart
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
            delete this.charts[canvasId];
        }

        const stageData = this.getStageSkillData(stage);
        
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error('Failed to get 2D context for canvas');
                return;
            }
            
            this.charts[canvasId] = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: stageData.labels,
                    datasets: [{
                        label: 'Your Skills',
                        data: stageData.values,
                        borderColor: this.getStageColor(stage),
                        backgroundColor: this.getStageColor(stage, 0.2),
                        pointBackgroundColor: this.getStageColor(stage),
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: this.getStageColor(stage)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 1,
                    animation: {
                        duration: 1000
                    },
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            pointLabels: { 
                                color: 'rgba(255, 255, 255, 0.8)',
                                font: { size: 12 }
                            },
                            ticks: {
                                color: 'rgba(255, 255, 255, 0.6)',
                                backdropColor: 'transparent',
                                stepSize: 1
                            },
                            suggestedMin: 0,
                            suggestedMax: 5
                        }
                    }
                }
            });
            
            // Force multiple resizes to ensure proper rendering
            setTimeout(() => {
                if (this.charts[canvasId]) {
                    this.charts[canvasId].resize();
                    // Second resize after a brief delay
                    setTimeout(() => {
                        if (this.charts[canvasId]) {
                            this.charts[canvasId].resize();
                        }
                    }, 100);
                }
            }, 100);
        } catch (error) {
            console.error('Failed to create skills chart:', error);
            // Fallback: show text-based skill display
            this.createFallbackSkillDisplay(canvasId, stageData);
        }
    }

    createFallbackSkillDisplay(canvasId, stageData) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const container = canvas.parentElement;
        if (!container) return;
        
        // Hide the canvas and create a fallback display
        canvas.style.display = 'none';
        
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'skills-fallback';
        fallbackDiv.innerHTML = `
            <div class="skills-list">
                ${stageData.labels.map((label, index) => `
                    <div class="skill-item">
                        <span class="skill-label">${label}</span>
                        <div class="skill-bar">
                            <div class="skill-progress" style="width: ${(stageData.values[index] / 5) * 100}%"></div>
                        </div>
                        <span class="skill-value">${stageData.values[index]}/5</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.appendChild(fallbackDiv);
    }

    getStageSkillData(stage) {
        const skillMappings = {
            stage1: {
                labels: ['AI Familiarity', 'Tool Usage', 'Error Tolerance', 'Experimentation', 'Team Sharing'],
                values: [2, 2, 1, 2, 1]
            },
            stage2: {
                labels: ['AI Familiarity', 'Tool Usage', 'Error Tolerance', 'Experimentation', 'Team Sharing'],
                values: [3, 3, 2, 3, 2]
            },
            stage3: {
                labels: ['AI Familiarity', 'Tool Usage', 'Error Tolerance', 'Experimentation', 'Team Sharing'],
                values: [4, 4, 4, 4, 4]
            },
            stage4: {
                labels: ['AI Familiarity', 'Tool Usage', 'Error Tolerance', 'Experimentation', 'Team Sharing'],
                values: [5, 5, 5, 5, 5]
            }
        };
        return skillMappings[stage] || skillMappings.stage1;
    }

    getStageColor(stage, alpha = 1) {
        const colors = {
            stage1: `rgba(239, 68, 68, ${alpha})`,
            stage2: `rgba(245, 158, 11, ${alpha})`,
            stage3: `rgba(16, 185, 129, ${alpha})`,
            stage4: `rgba(139, 92, 246, ${alpha})`
        };
        return colors[stage] || colors.stage1;
    }


    animateStageTransition(fromStage, toStage) {
        if (!window.gsap) return;

        const tl = gsap.timeline();
        
        // Fade out current content
        tl.to('.results-content', {
            opacity: 0,
            y: 20,
            duration: 0.3,
            ease: 'power2.out'
        });

        // Update content and fade back in
        tl.call(() => {
            this.updateStageContent(toStage);
        });

        tl.to('.results-content', {
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: 'power2.out'
        });

        return tl;
    }
}

// Results Manager
class ResultsManager {
    constructor(i18n, visualizationManager) {
        this.i18n = i18n;
        this.viz = visualizationManager;
    }

    displayResults(results) {
        const { stage, scores, percentage } = results;
        
        // Update stage indicator
        this.updateStageIndicator(stage);
        
        // Update stage description
        this.updateStageDescription(stage);
        
        // Update insights
        this.updateNextSteps(stage);
        this.updateToolRecommendations(stage);
        
        // Show results section first
        this.showResultsSection();
        
        // Create visualizations after section is visible
        setTimeout(() => {
            this.viz.createSkillsChart('skills-chart', stage, scores);
        }, 300); // Wait for section transition to complete
        
        // Store results for sharing/retaking
        this.storeResults(results);
    }

    updateStageIndicator(stage) {
        const indicator = document.getElementById('stage-indicator');
        const translations = this.i18n.translations[this.i18n.currentLang];
        
        if (indicator && translations?.stages?.[stage]) {
            const stageNumber = stage.replace('stage', '');
            indicator.innerHTML = `
                <div class="stage-badge" style="background: ${this.viz.getStageColor(stage)}">
                    Stage ${stageNumber}
                </div>
                <span>${translations.stages[stage].title}</span>
            `;
        }
    }

    updateStageDescription(stage) {
        const titleElement = document.getElementById('stage-title');
        const descElement = document.getElementById('stage-description');
        const translations = this.i18n.translations[this.i18n.currentLang];
        
        if (titleElement && descElement && translations?.stages?.[stage]) {
            titleElement.textContent = translations.stages[stage].title;
            descElement.textContent = translations.stages[stage].description;
        }
    }

    updateNextSteps(stage) {
        const listElement = document.getElementById('next-steps-list');
        const translations = this.i18n.translations[this.i18n.currentLang];
        
        if (listElement && translations?.stages?.[stage]?.nextSteps) {
            listElement.innerHTML = translations.stages[stage].nextSteps
                .map(step => `<li>${step}</li>`)
                .join('');
        }
    }

    updateToolRecommendations(stage) {
        const listElement = document.getElementById('tool-recommendations-list');
        const translations = this.i18n.translations[this.i18n.currentLang];
        
        if (listElement && translations?.stages?.[stage]?.tools) {
            listElement.innerHTML = translations.stages[stage].tools
                .map(tool => `<li>${tool}</li>`)
                .join('');
        }
    }

    showResultsSection() {
        // Hide assessment section
        const assessmentSection = document.getElementById('assessment');
        if (assessmentSection) {
            assessmentSection.style.display = 'none';
        }

        // Show results section
        const resultsSection = document.getElementById('results');
        if (resultsSection) {
            resultsSection.style.display = 'block';
            
            // Scroll to results
            resultsSection.scrollIntoView({ behavior: 'smooth' });
            
            // Initialize particles for results (very subtle)
            this.viz.initParticles('particles-results', {
                particles: {
                    number: { 
                        value: 15, 
                        density: { enable: true, value_area: 1500 } 
                    },
                    color: { value: "#ffffff" },
                    opacity: { 
                        value: 0.08,
                        random: true,
                        anim: {
                            enable: true,
                            speed: 0.5,
                            opacity_min: 0.02,
                            sync: false
                        }
                    },
                    size: { 
                        value: 2, 
                        random: true
                    },
                    line_linked: {
                        enable: true,
                        distance: 80,
                        color: "#ffffff",
                        opacity: 0.05,
                        width: 1
                    },
                    move: {
                        enable: true,
                        speed: 0.5
                    }
                }
            });

            // Animate results appearance
            if (window.gsap && window.AOS) {
                AOS.refresh();
            }
        }
    }

    storeResults(results) {
        const resultData = {
            ...results,
            timestamp: Date.now(),
            language: this.i18n.currentLang
        };
        
        try {
            localStorage.setItem('assessment-results', JSON.stringify(resultData));
        } catch (error) {
            console.warn('Failed to store results:', error);
        }
    }

    getStoredResults() {
        try {
            const stored = localStorage.getItem('assessment-results');
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.warn('Failed to retrieve stored results:', error);
            return null;
        }
    }

    getSharedResults() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const encodedResults = urlParams.get('results');
            
            if (!encodedResults) {
                return null;
            }
            
            // Decode the results from URL
            const decodedResults = JSON.parse(atob(encodedResults));
            
            // Validate the results structure
            if (decodedResults && decodedResults.stage && decodedResults.percentage) {
                return decodedResults;
            }
            
            return null;
        } catch (error) {
            console.warn('Failed to retrieve shared results:', error);
            return null;
        }
    }

    shareResults(results) {
        const { stage, percentage, scores } = results;
        const translations = this.i18n.translations[this.i18n.currentLang];
        const stageTitle = translations?.stages?.[stage]?.title || stage;
        const stageNumber = stage.replace('stage', '');
        
        // Create translated results text
        const shareText = translations?.share?.text || `I'm at Stage ${stageNumber}: ${stageTitle} on my AI Developer Journey!\n\nDiscover your AI development stage!`;
        const resultsText = shareText.replace('{stage}', stageNumber).replace('{title}', stageTitle);
        
        // Encode results in URL parameters
        const resultsData = {
            stage: stage,
            percentage: percentage,
            scores: scores,
            lang: this.i18n.currentLang,
            timestamp: Date.now()
        };
        
        const encodedResults = btoa(JSON.stringify(resultsData));
        const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
        const shareUrl = `${baseUrl}?results=${encodedResults}`;
        
        const shareData = {
            title: translations?.title || 'AI Developer Journey',
            text: resultsText,
            url: shareUrl
        };

        if (navigator.share) {
            navigator.share(shareData).catch(err => {
                console.log('Error sharing:', err);
                this.fallbackShare(shareData);
            });
        } else {
            this.fallbackShare(shareData);
        }
    }

    fallbackShare(shareData) {
        // Create a temporary text area to copy to clipboard
        const textArea = document.createElement('textarea');
        textArea.value = `${shareData.text}\n${shareData.url}`;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showShareNotification(true);
        } catch (err) {
            console.error('Failed to copy:', err);
            this.showShareNotification(false);
        } finally {
            document.body.removeChild(textArea);
        }
    }

    showShareNotification(success) {
        const translations = this.i18n.translations[this.i18n.currentLang];
        
        if (window.Swal) {
            const successTitle = translations?.share?.successTitle || 'Copied!';
            const successText = translations?.share?.successText || 'Results copied to clipboard';
            const errorTitle = translations?.share?.errorTitle || 'Share Failed';
            const errorText = translations?.share?.errorText || 'Please try again';
            
            Swal.fire({
                icon: success ? 'success' : 'error',
                title: success ? successTitle : errorTitle,
                text: success ? successText : errorText,
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            const successMsg = translations?.share?.successText || 'Results copied to clipboard!';
            const errorMsg = translations?.share?.errorText || 'Failed to share results.';
            alert(success ? successMsg : errorMsg);
        }
    }
}

// Main Application
class AIJourneyApp {
    constructor() {
        this.i18n = new I18nManager();
        this.assessment = new AssessmentManager(this.i18n);
        this.viz = new VisualizationManager();
        this.results = new ResultsManager(this.i18n, this.viz);
        this.isInitialized = false;
        this.pendingSharedResults = null;
    }

    async init() {
        try {
            // Show loading screen
            this.showLoadingScreen();
            
            // Load initial language
            await this.i18n.loadTranslations(this.i18n.currentLang);
            
            // Initialize UI
            this.initializeUI();
            
            // Initialize particles early to prevent white background
            this.initializeParticles();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Initialize other animations
            this.initializeAnimations();
            
            // Check for shared results and display them
            this.checkForSharedResults();
            
            // Hide loading screen
            this.hideLoadingScreen();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showErrorMessage('Failed to load the application. Please refresh and try again.');
        }
    }

    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const mainContainer = document.getElementById('main-container');
        
        if (loadingScreen && mainContainer) {
            setTimeout(() => {
                if (window.gsap) {
                    gsap.to(loadingScreen, {
                        opacity: 0,
                        duration: 0.5,
                        onComplete: () => {
                            loadingScreen.style.display = 'none';
                            mainContainer.style.display = 'block';
                            // Display pending shared results after loading screen is hidden
                            this.displayPendingSharedResults();
                        }
                    });
                } else {
                    loadingScreen.style.display = 'none';
                    mainContainer.style.display = 'block';
                    // Display pending shared results after loading screen is hidden
                    this.displayPendingSharedResults();
                }
            }, 1000);
        }
    }

    initializeUI() {
        // Set HTML language attribute
        document.documentElement.lang = this.i18n.currentLang;
        
        // Update all UI text
        this.i18n.updateUI();
        
        // Load assessment questions
        this.assessment.loadQuestions();
    }

    setupEventListeners() {
        // Language switcher
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const lang = btn.dataset.lang;
                if (lang && lang !== this.i18n.currentLang) {
                    const success = await this.i18n.changeLanguage(lang);
                    if (success) {
                        // Reload questions if in assessment mode
                        if (this.isInAssessmentMode()) {
                            this.assessment.loadQuestions();
                            this.assessment.renderQuestion(this.assessment.currentQuestionIndex);
                        }
                        // Update results if viewing results
                        if (this.isInResultsMode()) {
                            const storedResults = this.results.getStoredResults();
                            if (storedResults) {
                                this.results.displayResults(storedResults);
                            }
                        }
                    }
                }
            });
        });

        // Start assessment button
        const startBtn = document.getElementById('start-assessment');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startAssessment();
            });
        }

        // Assessment navigation
        const prevBtn = document.getElementById('prev-question');
        const nextBtn = document.getElementById('next-question');
        const finishBtn = document.getElementById('finish-assessment');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.assessment.previousQuestion();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.assessment.nextQuestion();
            });
        }

        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                this.finishAssessment();
            });
        }
        
        // Listen for auto-finish assessment event
        document.addEventListener('finishAssessment', () => {
            this.finishAssessment();
        });

        // Results actions
        const retakeBtn = document.getElementById('retake-assessment');
        const shareBtn = document.getElementById('share-results');

        if (retakeBtn) {
            retakeBtn.addEventListener('click', () => {
                this.retakeAssessment();
            });
        }

        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                const storedResults = this.results.getStoredResults();
                if (storedResults) {
                    this.results.shareResults(storedResults);
                }
            });
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isInAssessmentMode()) {
                if (e.key === 'ArrowLeft' && !prevBtn?.disabled) {
                    this.assessment.previousQuestion();
                } else if (e.key === 'ArrowRight' && !nextBtn?.disabled) {
                    this.assessment.nextQuestion();
                } else if (e.key === 'Enter' && finishBtn?.style.display !== 'none') {
                    this.finishAssessment();
                }
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            // Handle language changes from URL
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            if (urlLang && urlLang !== this.i18n.currentLang) {
                this.i18n.changeLanguage(urlLang);
            }
        });

        // Handle resize for canvas elements
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    initializeAnimations() {
        // Initialize AOS (Animate On Scroll)
        if (window.AOS) {
            AOS.init({
                duration: 600,
                easing: 'ease-out-cubic',
                once: true,
                offset: 50
            });
        }

        // Initialize Tippy.js for tooltips
        if (window.tippy) {
            tippy('[data-tippy-content]', {
                arrow: true,
                animation: 'fade',
                theme: 'ai-journey'
            });
        }

        // GSAP animations for hero section
        if (window.gsap) {
            gsap.registerPlugin(ScrollTrigger);
            
            // Hero content animation
            gsap.fromTo('.hero-content', {
                opacity: 0,
                y: 50
            }, {
                opacity: 1,
                y: 0,
                duration: 1.2,
                ease: 'power3.out',
                delay: 0.5
            });

            // Stage bubbles animation
            gsap.fromTo('.stage-bubble', {
                scale: 0,
                opacity: 0
            }, {
                scale: 1,
                opacity: 1,
                duration: 0.8,
                stagger: 0.1,
                ease: 'back.out(1.7)',
                delay: 1
            });
        }
    }

    initializeParticles() {
        // Ensure particles container exists and is properly set up
        const heroContainer = document.getElementById('particles-hero');
        if (!heroContainer) {
            console.warn('Particles hero container not found');
            return;
        }

        // Ensure container has proper dimensions
        if (heroContainer.offsetWidth === 0 || heroContainer.offsetHeight === 0) {
            // Wait a bit for layout to complete and try again
            setTimeout(() => this.initializeParticles(), 100);
            return;
        }

        // Initialize particles with error handling
        try {
            this.viz.initParticles('particles-hero');
            
            // Add resize handler with throttling
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.reinitializeParticles();
                }, 200);
            });
        } catch (error) {
            console.error('Failed to initialize particles:', error);
        }
    }

    reinitializeParticles() {
        try {
            // Clean up existing particles
            if (window.pJSDom && window.pJSDom.length > 0) {
                window.pJSDom.forEach(pjs => {
                    if (pjs.pJS && pjs.pJS.fn && pjs.pJS.fn.vendors) {
                        pjs.pJS.fn.vendors.destroypJS();
                    }
                });
                window.pJSDom = [];
            }
            
            // Reinitialize particles
            setTimeout(() => {
                this.viz.initParticles('particles-hero');
            }, 50);
        } catch (error) {
            console.error('Failed to reinitialize particles:', error);
        }
    }

    startAssessment() {
        const heroSection = document.getElementById('hero');
        const assessmentSection = document.getElementById('assessment');
        
        if (heroSection && assessmentSection) {
            // Reset assessment
            this.assessment.reset();
            
            // Show assessment section
            assessmentSection.style.display = 'block';
            assessmentSection.scrollIntoView({ behavior: 'smooth' });
            
            // Render first question
            this.assessment.renderQuestion(0);
            
            // Animate transition
            if (window.gsap) {
                gsap.fromTo(assessmentSection, {
                    opacity: 0,
                    y: 30
                }, {
                    opacity: 1,
                    y: 0,
                    duration: 0.6,
                    ease: 'power2.out'
                });
            }
        }
    }

    finishAssessment() {
        // Calculate results
        const results = this.assessment.calculateResults();
        
        // Display results
        this.results.displayResults(results);
        
        // Track completion (for analytics if needed)
        this.trackAssessmentCompletion(results);
    }

    retakeAssessment() {
        // Hide results section
        const resultsSection = document.getElementById('results');
        const assessmentSection = document.getElementById('assessment');
        
        if (resultsSection && assessmentSection) {
            resultsSection.style.display = 'none';
            
            // Reset and start assessment
            this.assessment.reset();
            this.assessment.renderQuestion(0);
            
            assessmentSection.style.display = 'block';
            assessmentSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    isInAssessmentMode() {
        const assessmentSection = document.getElementById('assessment');
        return assessmentSection && assessmentSection.style.display !== 'none';
    }

    isInResultsMode() {
        const resultsSection = document.getElementById('results');
        return resultsSection && resultsSection.style.display !== 'none';
    }

    handleResize() {
        // Handle any resize-related updates if needed
        if (this.isInResultsMode()) {
            // Redraw skills chart if needed
            const skillsChart = document.getElementById('skills-chart');
            if (skillsChart) {
                const storedResults = this.results.getStoredResults();
                if (storedResults) {
                    this.viz.createSkillsChart('skills-chart', storedResults.stage, storedResults.scores);
                }
            }
        }

        // Refresh AOS
        if (window.AOS) {
            AOS.refresh();
        }
    }

    trackAssessmentCompletion(results) {
        // Placeholder for analytics tracking
        // Could integrate with Google Analytics, Mixpanel, etc.
        console.log('Assessment completed:', {
            stage: results.stage,
            language: this.i18n.currentLang,
            timestamp: Date.now()
        });
    }

    checkForSharedResults() {
        const sharedResults = this.results.getSharedResults();
        if (sharedResults) {
            // Store shared results to display after loading screen
            this.pendingSharedResults = sharedResults;
        }
    }

    displayPendingSharedResults() {
        if (this.pendingSharedResults) {
            const sharedResults = this.pendingSharedResults;
            
            // Update the language if specified in the shared results
            if (sharedResults.lang && sharedResults.lang !== this.i18n.currentLang) {
                this.i18n.changeLanguage(sharedResults.lang).then(() => {
                    this.results.displayResults(sharedResults);
                    this.cleanupSharedResultsUrl();
                });
            } else {
                this.results.displayResults(sharedResults);
                this.cleanupSharedResultsUrl();
            }
            
            this.pendingSharedResults = null;
        }
    }

    cleanupSharedResultsUrl() {
        // Clean up the URL after results are fully displayed
        setTimeout(() => {
            const url = new URL(window.location);
            url.searchParams.delete('results');
            window.history.replaceState({}, '', url);
        }, 2000); // Wait longer to ensure results are fully rendered
    }

    showErrorMessage(message) {
        if (window.Swal) {
            Swal.fire({
                icon: 'error',
                title: 'Oops!',
                text: message,
                confirmButtonColor: '#3B82F6'
            });
        } else {
            alert(message);
        }
    }
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator && 'PushManager' in window) {
    window.addEventListener('load', () => {
        // Note: Service worker would be implemented separately
        // This is just a placeholder for PWA functionality
    });
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new AIJourneyApp();
    app.init().catch(error => {
        console.error('Failed to start application:', error);
    });
});

// Global error handling
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIJourneyApp, I18nManager, AssessmentManager, VisualizationManager, ResultsManager };
}