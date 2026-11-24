# The browser that takes the owner page's pictures of apps (src/screenshots.ts). headless-shell is Chrome's
# headless build and nothing else; it answers the DevTools protocol on 9222, which the Host calls.
# The fonts are added so an app written in Chinese, Japanese or Korean, or with emoji, is pictured as it looks.
FROM chromedp/headless-shell:157.0.8103.27
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
