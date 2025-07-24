// File: Frontend/apiConfig.js

const KairoServer = {
    // This function will repeatedly try to contact the server until it succeeds or times out.
    async waitForReady() {
        const MAX_ATTEMPTS = 60; // Try for 30 seconds (60 attempts * 500ms), increased timeout
        const PING_INTERVAL = 500; // 0.5 seconds

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            try {
                // We ping a known, simple ComfyUI endpoint. /queue is a good choice.
                // The { signal } part is an AbortController to prevent fetches from hanging too long.
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 450); // Timeout each fetch just under the interval
                
                const response = await fetch('/api/queue', { signal: controller.signal });
                clearTimeout(timeoutId);

                // If we get any kind of response (even a 404 or 500), it means the server is alive and responding to HTTP.
                // This is enough to know the proxy is working and the backend is up.
                if (response.status > 0) {
                    console.log(`✅ Server responded on attempt ${i + 1}. Status: ${response.status}`);
                    return { success: true };
                }
            } catch (error) {
                // This 'catch' block will run on network errors (i.e., the server is not reachable at all)
                // or on our self-imposed timeout.
                console.log(`Attempt ${i + 1}/${MAX_ATTEMPTS} failed. Server not yet responding. Retrying...`);
            }
            
            // Wait before the next attempt
            await new Promise(resolve => setTimeout(resolve, PING_INTERVAL));
        }

        // If the loop finishes without success, we've timed out.
        console.error("Server check timed out after all attempts.");
        return { success: false, error: 'Host server did not respond in time (Timeout).' };
    }
};