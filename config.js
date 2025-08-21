window.APP_CONFIG = {
	// Same-origin API when deployed on Render (serving frontend + backend together)
	FURIGANA_API_BASE: (window._env_ && window._env_.FURIGANA_API_BASE) || ''
};

