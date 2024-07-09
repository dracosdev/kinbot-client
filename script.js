document.getElementById('send-button').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

document.getElementById('file-input').addEventListener('change', processFile);
document.getElementById('lock-api-key-button').addEventListener('click', toggleApiKeyLock);
document.getElementById('theme-toggle-checkbox').addEventListener('change', toggleTheme);
document.getElementById('open-sidebar-btn').addEventListener('click', toggleSidebar);
document.querySelector('#sidebar .close-btn').addEventListener('click', closeSidebar);
document.addEventListener('click', closeSidebarOnClickOutside);

marked.setOptions({
    highlight: function (code, lang) {
        return hljs.highlightAuto(code, [lang]).value;
    }
});

function toggleApiKeyLock() {
    const apiKeyInput = document.getElementById('api-key');
    const lockButton = document.getElementById('lock-api-key-button');
    
    if (apiKeyInput.disabled) {
        // Unlock the API key input
        apiKeyInput.disabled = false;
        lockButton.textContent = 'Lock API Key';
        lockButton.classList.remove('locked');
    } else {
        // Lock the API key input and load models
        apiKeyInput.disabled = true;
        lockButton.textContent = 'Unlock API Key';
        lockButton.classList.add('locked');
        loadModels(apiKeyInput.value);
    }
}

function loadModels(apiKey) {
    fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        }
    })
    .then(response => response.json())
    .then(data => {
        const modelSelector = document.getElementById('model-selector');
        modelSelector.innerHTML = '';  // Clear any existing options

        data.data.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            modelSelector.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while loading models. Please check your API key and try again.');
    });
}

function sendMessage() {
    const apiKey = document.getElementById('api-key').value;
    const userInput = document.getElementById('user-input').value;
    const model = document.getElementById('model-selector').value;
    const loader = document.getElementById('loader');

    if (!apiKey) {
        alert('Please enter your API key.');
        return;
    }

    if (!userInput) {
        return;
    }

    appendMessage('user', userInput);
    loader.style.display = 'block';

    fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{"role": "user", "content": userInput}]
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error.message);
        }
        const botResponse = data.choices[0].message.content.trim();
        appendMessage('bot', botResponse, true);
        loader.style.display = 'none';
    })
    .catch(error => {
        console.error('Error:', error);
        appendMessage('bot', `An error occurred: ${error.message}`);
        loader.style.display = 'none';
    });

    document.getElementById('user-input').value = '';
}

function processFile() {
    const apiKey = document.getElementById('api-key').value;
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    const model = document.getElementById('model-selector').value;
    const loader = document.getElementById('loader');

    if (!apiKey) {
        alert('Please enter your API key.');
        return;
    }

    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const fileContent = e.target.result;

        appendMessage('user', 'Uploading file and processing...');
        loader.style.display = 'block';

        fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: fileContent,
                purpose: 'fine-tune'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error.message);
            }

            // File uploaded, now let's process it
            fetch(`https://api.openai.com/v1/engines/${model}/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    prompt: `Please summarize the content of this file: ${fileContent}`,
                    max_tokens: 150,
                    temperature: 0.7,
                    top_p: 1.0,
                    frequency_penalty: 0.0,
                    presence_penalty: 0.0
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message);
                }
                const botResponse = data.choices[0].text.trim();
                appendMessage('bot', botResponse, true);
                loader.style.display = 'none';
            })
            .catch(error => {
                console.error('Error:', error);
                appendMessage('bot', `An error occurred while processing the file: ${error.message}`);
                loader.style.display = 'none';
            });
        })
        .catch(error => {
            console.error('Error:', error);
            appendMessage('bot', `An error occurred while uploading the file: ${error.message}`);
            loader.style.display = 'none';
        });
    };

    reader.readAsText(file);
}

function appendMessage(sender, message, isMarkdown = true) {
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message');
    messageContainer.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

    if (isMarkdown) {
        // Detect and process code blocks
        const codeBlockPattern = /```(.*?)\n([\s\S]*?)```/g;
        let match;
        let lastIndex = 0;
        let html = '';

        while ((match = codeBlockPattern.exec(message)) !== null) {
            const [fullMatch, lang, code] = match;
            html += marked.parse(message.slice(lastIndex, match.index));
            html += `<pre><code class="hljs ${lang}">${escapeHtml(code)}</code></pre>`;
            lastIndex = match.index + fullMatch.length;
        }

        html += marked.parse(message.slice(lastIndex));
        messageContainer.innerHTML = html;
    } else {
        messageContainer.textContent = message;
    }

    document.getElementById('messages').appendChild(messageContainer);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

    // Re-highlighting code blocks
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightBlock(block);
    });
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function toggleTheme() {
    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const isDark = body.classList.contains('dark-theme');
    const themeTitle = document.getElementById('theme-title');
    const isTitleDark = themeTitle.classList.contains('dark-theme');
    body.classList.toggle('dark-theme', !isDark);
    body.classList.toggle('light-theme', isDark);
    sidebar.classList.toggle('dark-theme', !isDark);
    sidebar.classList.toggle('light-theme', isDark);
    themeTitle.classList.toggle('dark-title');
    themeTitle.classList.toggle('light-title');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.style.display === 'block') {
        closeSidebar();
    } else {
        openSidebar();
    }
}

function openSidebar() {
    document.getElementById('sidebar').style.display = 'block';
}

function closeSidebar() {
    document.getElementById('sidebar').style.display = 'none';
}

function closeSidebarOnClickOutside(event) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.style.display === 'block' && !sidebar.contains(event.target) && !document.getElementById('open-sidebar-btn').contains(event.target)) {
        closeSidebar();
    }
}
