def summarize_text(text):
    # In a real deployed environment, we would use transformers/bart-large-cnn
    # For this project setup, if dependencies are heavy, we mock or use a lightweight approach.
    
    # Simple extraction-based summary (mock)
    sentences = text.split('. ')
    summary = ". ".join(sentences[:3]) if len(sentences) > 3 else text
    
    return {
        "summary": summary,
        "original_length": len(text),
        "summary_length": len(summary)
    }
