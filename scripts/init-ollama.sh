#!/bin/bash

# Wait for Ollama to be ready
echo "Waiting for Ollama to start..."
until curl -s http://localhost:11434/api/tags > /dev/null; do
    echo "Ollama not ready, waiting..."
    sleep 5
done

echo "Ollama is ready. Pulling models..."

# Pull llama3 model
echo "Pulling llama3..."
ollama pull llama3

# Pull llava model for vision
echo "Pulling llava..."
ollama pull llava

echo "Models pulled successfully!"
echo "Available models:"
ollama list
