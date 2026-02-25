import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { getApiBaseUrl } from '../utils/apiConfig';
import './HealthAIChat.css';

const SUGGESTED_QUESTIONS = [
  "What are my most tracked health metrics?",
  "How consistent is my workout routine?",
  "What trends do you see in my heart rate data?",
  "How active am I compared to recommended guidelines?",
  "Give me a weekly health summary",
  "What should I focus on improving?",
];

export default function HealthAIChat({ healthData, importedHealthData }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const apiBaseUrl = getApiBaseUrl();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build a compact summary to send to the server
  const buildHealthSummary = () => {
    const summary = {};

    // From imported server data
    if (importedHealthData) {
      summary.totalRecords = importedHealthData.totalRecords;
      summary.totalWorkouts = importedHealthData.totalWorkouts;
      summary.totalECGs = importedHealthData.totalECGs;
      summary.topMetrics = importedHealthData.summary?.topMetrics;
    }

    // From dashboard healthData (client-parsed or server-transformed)
    if (healthData) {
      summary.metricsByType = {};
      // Send only summary stats, not the full value arrays
      if (healthData.metricsByType) {
        for (const [type, data] of Object.entries(healthData.metricsByType)) {
          summary.metricsByType[type] = {
            count: data.count,
            min: data.min,
            max: data.max,
            avg: data.avg || (data.count > 0 ? +(data.sum / data.count).toFixed(2) : 0),
            unit: data.unit,
            source: data.source
          };
        }
      }
      summary.workoutsByDate = healthData.workoutsByDate;
      summary.allDates = healthData.allDates;
      if (!summary.totalRecords && healthData.summary) {
        summary.totalRecords = healthData.summary.totalRecords;
        summary.totalWorkouts = healthData.summary.totalWorkouts;
        summary.topMetrics = healthData.summary.topMetrics;
      }
    }

    return summary;
  };

  const sendMessage = async (question) => {
    if (!question.trim()) return;

    const userMessage = { role: 'user', content: question.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      if (!apiBaseUrl) {
        throw new Error('API server not configured. Set VITE_API_BASE_URL in your .env file.');
      }

      const healthSummary = buildHealthSummary();
      const conversationHistory = messages.slice(-10);

      const response = await axios.post(
        `${apiBaseUrl.replace(/\/$/, '')}/api/ask`,
        { question: question.trim(), healthSummary, conversationHistory },
        { timeout: 60000 }
      );

      const assistantMessage = { role: 'assistant', content: response.data.answer };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errMsg = err?.response?.data?.error || err.message || 'Failed to get AI response';
      setError(errMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}`, isError: true }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestion = (q) => {
    sendMessage(q);
  };

  return (
    <div className="health-ai-chat">
      <div className="chat-header">
        <Bot size={24} />
        <div>
          <h3>AI Health Assistant</h3>
          <p className="chat-subtitle">Ask questions about your health data</p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <Sparkles size={32} className="welcome-icon" />
            <h4>Ask me anything about your health data!</h4>
            <p>I can analyze your metrics, find trends, and provide insights.</p>
            <div className="suggested-questions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} className="suggestion-btn" onClick={() => handleSuggestion(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
            </div>
            <div className="message-content">
              <div className="message-text">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant loading">
            <div className="message-avatar">
              <Bot size={18} />
            </div>
            <div className="message-content">
              <div className="message-text typing-indicator">
                <Loader2 size={16} className="spin" />
                Analyzing your data...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your health data..."
          disabled={loading}
          className="chat-input"
        />
        <button type="submit" disabled={loading || !input.trim()} className="chat-send-btn">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
