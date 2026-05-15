FROM ollama/ollama:0.6.7
RUN ollama serve & \
    sleep 15 && \
    ollama pull llama3 && \
    ollama pull llava && \
    pkill ollama