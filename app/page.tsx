"use client";

import { useEffect, useRef, useState } from "react";

import ReactMarkdown from "react-markdown";

import remarkMath from "remark-math";

import rehypeKatex from "rehype-katex";

import "katex/dist/katex.min.css";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const modes = [

  "EXPLAIN",

  "SOLVE",

  "HINT",

  "SIMPLIFY",

  "PRACTICE",

  "QUIZ",

];

type Message = {

  role: "USER" | "ASSISTANT";

  content: string;

};

type SelectedImage = {

  file: File;

  previewUrl: string;

  base64: string;

  mimeType: string;

};

export default function Home() {

  const [grade, setGrade] = useState(8);

  const [subject, setSubject] = useState("Science");

  const [mode, setMode] = useState("EXPLAIN");

  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);

  const [conversationId, setConversationId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);

  const [selectedImage, setSelectedImage] =

    useState<SelectedImage | null>(null);

  const [imageError, setImageError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ------------------------------------------------------------

  // Restore previous conversation

  // ------------------------------------------------------------

  useEffect(() => {

    const savedConversationId = localStorage.getItem(

      "schoolbuddyConversationId"

    );

    if (!savedConversationId) {

      return;

    }

    const id = Number(savedConversationId);

    if (!id) {

      return;

    }

    setConversationId(id);

    loadConversation(id);

  }, []);

  // ------------------------------------------------------------

  // Load conversation

  // ------------------------------------------------------------

  async function loadConversation(id: number) {

    try {

      const response = await fetch(

        `${API_BASE_URL}/api/conversations/${id}`

      );

      if (!response.ok) {

        throw new Error("Failed to load conversation");

      }

      const data: Message[] = await response.json();

      setMessages(data);

    } catch (error) {

      console.error("Conversation loading error:", error);

    }

  }

  // ------------------------------------------------------------

  // Convert File to Base64

  // ------------------------------------------------------------

  function fileToBase64(file: File): Promise<string> {

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = () => {

        const result = reader.result;

        if (typeof result !== "string") {

          reject(new Error("Could not read image"));

          return;

        }

        /*

         * FileReader returns:

         *

         * data:image/jpeg;base64,XXXXXXXX

         *

         * We only send the Base64 portion to Spring Boot.

         */

        const base64 = result.split(",")[1];

        if (!base64) {

          reject(new Error("Invalid image data"));

          return;

        }

        resolve(base64);

      };

      reader.onerror = () => {

        reject(new Error("Failed to read image"));

      };

      reader.readAsDataURL(file);

    });

  }

  // ------------------------------------------------------------

  // Handle image selection

  // ------------------------------------------------------------

  async function handleImageSelect(

    event: React.ChangeEvent<HTMLInputElement>

  ) {

    setImageError("");

    const file = event.target.files?.[0];

    if (!file) {

      return;

    }

    const allowedTypes = [

      "image/jpeg",

      "image/png",

      "image/webp",

    ];

    if (!allowedTypes.includes(file.type)) {

      setImageError(

        "Please select a JPG, JPEG, PNG, or WebP image."

      );

      event.target.value = "";

      return;

    }

    /*

     * Keep the first implementation reasonably lightweight.

     */

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {

      setImageError("Image must be smaller than 5 MB.");

      event.target.value = "";

      return;

    }

    try {

      const base64 = await fileToBase64(file);

      const previewUrl = URL.createObjectURL(file);

      setSelectedImage({

        file,

        previewUrl,

        base64,

        mimeType: file.type,

      });

    } catch (error) {

      console.error("Image processing error:", error);

      setImageError("Could not process this image.");

    }

  }

  // ------------------------------------------------------------

  // Remove selected image

  // ------------------------------------------------------------

  function removeImage() {

    if (selectedImage) {

      URL.revokeObjectURL(selectedImage.previewUrl);

    }

    setSelectedImage(null);

    setImageError("");

    if (fileInputRef.current) {

      fileInputRef.current.value = "";

    }

  }

  // ------------------------------------------------------------

  // Send message

  // ------------------------------------------------------------

  async function sendMessage() {

    const trimmedMessage = message.trim();

    /*

     * Allow:

     *

     * text only

     * image only

     * text + image

     */

    if (!trimmedMessage && !selectedImage) {

      return;

    }

    if (loading) {

      return;

    }

    /*

     * Display the user's message.

     *

     * If an image was attached, indicate it in the conversation.

     */

    let displayMessage = trimmedMessage;

    if (selectedImage) {

      if (displayMessage) {

        displayMessage +=

          `\n[Image attached: ${selectedImage.file.name}]`;

      } else {

        displayMessage =

          `[Image attached: ${selectedImage.file.name}]`;

      }

    }

    const userMessage: Message = {

      role: "USER",

      content: displayMessage,

    };

    setMessages((previous) => [

      ...previous,

      userMessage,

    ]);

    /*

     * Preserve image data before clearing the UI.

     */

    const imageData = selectedImage;

    setMessage("");

    setSelectedImage(null);

    setImageError("");

    setLoading(true);

    if (fileInputRef.current) {

      fileInputRef.current.value = "";

    }

    try {

      const response = await fetch(

        `${API_BASE_URL}/api/chat`,

        {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({

            conversationId,

            grade,

            subject,

            mode,

            message: trimmedMessage,

            imageBase64: imageData?.base64 ?? null,

            imageMimeType:

              imageData?.mimeType ?? null,

            imageName:

              imageData?.file.name ?? null,

          }),

        }

      );

      const data = await response.json();

      if (!response.ok) {

        throw new Error(
          data?.message ||
            data?.error ||
            `SchoolBuddy returned an error (${response.status}).`
        );
      }

      /*

       * Save conversation ID.

       */

      setConversationId(data.conversationId);

      localStorage.setItem(

        "schoolbuddyConversationId",

        String(data.conversationId)

      );

      /*

       * Add AI response.

       */

      const assistantMessage: Message = {

        role: "ASSISTANT",

        content: data.answer,

      };

      setMessages((previous) => [

        ...previous,

        assistantMessage,

      ]);

    } catch (error) {

      console.error("Chat error:", error);

      let userFriendlyMessage =
        "Something went wrong while processing your request. Please try again.";

      if (error instanceof TypeError) {
        userFriendlyMessage =
          "I couldn't reach the SchoolBuddy backend. Please make sure the Spring Boot server is running on port 8080.";
      } else if (error instanceof Error) {
        userFriendlyMessage = error.message;
      }

      const errorMessage: Message = {
        role: "ASSISTANT",
        content: userFriendlyMessage,
      };

      setMessages((previous) => [
        ...previous,
        errorMessage,
      ]);
    } finally {

      setLoading(false);

    }

  }

  // ------------------------------------------------------------

  // New conversation

  // ------------------------------------------------------------

  function startNewConversation() {

    setConversationId(null);

    setMessages([]);

    setMessage("");

    setImageError("");

    removeImage();

    localStorage.removeItem(

      "schoolbuddyConversationId"

    );

  }

  // ------------------------------------------------------------

  // UI

  // ------------------------------------------------------------

  return (

    <main className="min-h-screen bg-slate-950 text-white">

      {/* ======================================================

          HEADER

          ====================================================== */}

      <header className="border-b border-slate-800 bg-slate-950/95">

        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">

          <div>

            <h1 className="text-2xl font-bold tracking-tight">

              SchoolBuddy

              <span className="text-blue-400">

                .ai

              </span>

            </h1>

            <p className="text-sm text-slate-400">

              Your AI learning companion

            </p>

          </div>

          <div className="flex items-center gap-3">

            {/* Grade */}

            <select

              value={grade}

              onChange={(e) =>

                setGrade(

                  Number(e.target.value)

                )

              }

              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-blue-500"

            >

              {Array.from(

                { length: 10 },

                (_, index) => index + 1

              ).map((value) => (

                <option

                  key={value}

                  value={value}

                >

                  Grade {value}

                </option>

              ))}

            </select>

            {/* Subject */}

            <select

              value={subject}

              onChange={(e) =>

                setSubject(e.target.value)

              }

              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-blue-500"

            >

              <option>Math</option>

              <option>Science</option>

              <option>English</option>

            </select>

            {/* New Chat */}

            <button

              onClick={

                startNewConversation

              }

              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-blue-500 hover:text-white"

            >

              New Chat

            </button>

          </div>

        </div>

      </header>

      {/* ======================================================

          MAIN

          ====================================================== */}

      <section className="mx-auto flex min-h-[calc(100vh-81px)] max-w-4xl flex-col px-6 py-10">

        {/* ====================================================

            WELCOME

            ==================================================== */}

        {messages.length === 0 && (

          <div className="flex flex-1 flex-col items-center justify-center text-center">

            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20 text-3xl">

              🎓

            </div>

            <h2 className="text-4xl font-bold tracking-tight">

              What do you want to learn?

            </h2>

            <p className="mt-3 max-w-xl text-slate-400">

              Ask a question, solve a problem, or

              upload a textbook question.

              SchoolBuddy explains concepts according

              to your grade level.

            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">

              {[

                "Explain a concept",

                "Solve a problem",

                "Give me a hint",

                "Simplify this",

                "Practice questions",

                "Quiz me",

              ].map((item) => (

                <button

                  key={item}

                  onClick={() =>

                    setMessage(item)

                  }

                  className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300 transition hover:border-blue-500 hover:bg-slate-800"

                >

                  {item}

                </button>

              ))}

            </div>

          </div>

        )}

        {/* ====================================================

            CONVERSATION

            ==================================================== */}

        {messages.length > 0 && (

          <div className="flex-1 space-y-6 pb-8">

            {messages.map(

              (item, index) => {

                const isUser =

                  item.role === "USER";

                return (

                  <div

                    key={index}

                    className={`flex ${

                      isUser

                        ? "justify-end"

                        : "justify-start"

                    }`}

                  >

                    {isUser ? (

                      <div className="max-w-2xl rounded-2xl rounded-br-md bg-blue-600 px-5 py-3">

                        <p className="whitespace-pre-wrap text-sm leading-6">

                          {item.content}

                        </p>

                      </div>

                    ) : (

                      <div className="max-w-3xl rounded-2xl rounded-bl-md border border-slate-800 bg-slate-900 px-6 py-5">

                        <div className="mb-3 flex items-center gap-2">

                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">

                            🎓

                          </div>

                          <span className="font-semibold text-blue-400">

                            SchoolBuddy

                          </span>

                        </div>

                        <div className="schoolbuddy-markdown text-sm leading-7 text-slate-200">

                          <ReactMarkdown

                            remarkPlugins={[remarkMath]}

                            rehypePlugins={[rehypeKatex]}

                            components={{

                              a: ({ node, ...props }) => (

                                <a

                                  {...props}

                                  target="_blank"

                                  rel="noopener noreferrer"

                                  className="text-blue-400 underline hover:text-blue-300"

                                />

                              ),

                              blockquote: ({ node, ...props }) => (

                                <blockquote

                                  {...props}

                                  className="my-4 border-l-4 border-slate-600 pl-4 italic text-slate-300"

                                />

                              ),

                              code: ({ node, className, children, ...props }) => (

                                <code

                                  {...props}

                                  className={`${className ?? ""} rounded bg-slate-800/80 px-1.5 py-0.5 text-sm`}

                                >

                                  {children}

                                </code>

                              ),

                            }}

                          >

                            {item.content}

                          </ReactMarkdown>

                        </div>

                      </div>

                    )}

                  </div>

                );

              }

            )}

            {/* Loading */}

            {loading && (

              <div className="flex justify-start">

                <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4">

                  <div className="flex items-center gap-2 text-sm text-slate-400">

                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />

                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />

                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />

                    <span className="ml-2">

                      SchoolBuddy is thinking...

                    </span>

                  </div>

                </div>

              </div>

            )}

          </div>

        )}

        {/* ====================================================

            LEARNING MODES

            ==================================================== */}

        <div className="mb-4">

          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">

            Learning Mode

          </div>

          <div className="flex flex-wrap gap-2">

            {modes.map((item) => (

              <button

                key={item}

                onClick={() =>

                  setMode(item)

                }

                className={`rounded-full px-4 py-2 text-xs font-medium transition ${

                  mode === item

                    ? "bg-blue-600 text-white"

                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"

                }`}

              >

                {item}

              </button>

            ))}

          </div>

        </div>

        {/* ====================================================

            IMAGE ERROR

            ==================================================== */}

        {imageError && (

          <div className="mb-3 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">

            {imageError}

          </div>

        )}

        {/* ====================================================

            SELECTED IMAGE PREVIEW

            ==================================================== */}

        {selectedImage && (

          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900 p-3">

            <div className="flex items-start gap-4">

              <img

                src={selectedImage.previewUrl}

                alt="Selected question"

                className="h-24 w-24 rounded-lg object-cover"

              />

              <div className="min-w-0 flex-1">

                <p className="truncate text-sm font-medium text-slate-200">

                  {selectedImage.file.name}

                </p>

                <p className="mt-1 text-xs text-slate-500">

                  {(

                    selectedImage.file.size /

                    1024 /

                    1024

                  ).toFixed(2)}{" "}

                  MB

                </p>

                <p className="mt-2 text-xs text-green-400">

                  Image ready to send

                </p>

              </div>

              <button

                onClick={removeImage}

                className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"

              >

                Remove

              </button>

            </div>

          </div>

        )}

        {/* ====================================================

            INPUT

            ==================================================== */}

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">

          <div className="flex items-end gap-3">

            {/* Hidden file input */}

            <input

              ref={fileInputRef}

              type="file"

              accept="image/jpeg,image/png,image/webp"

              onChange={

                handleImageSelect

              }

              className="hidden"

            />

            {/* Attach button */}

            <button

              onClick={() =>

                fileInputRef.current?.click()

              }

              disabled={loading}

              title="Attach image"

              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-xl text-slate-300 transition hover:border-blue-500 hover:text-white disabled:opacity-40"

            >

              📎

            </button>

            {/* Text */}

            <textarea

              value={message}

              onChange={(e) =>

                setMessage(e.target.value)

              }

              onKeyDown={(e) => {

                if (

                  e.key === "Enter" &&

                  !e.shiftKey

                ) {

                  e.preventDefault();

                  sendMessage();

                }

              }}

              placeholder="Ask SchoolBuddy anything..."

              rows={3}

              className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"

            />

            {/* Send */}

            <button

              onClick={sendMessage}

              disabled={

                loading ||

                (

                  !message.trim() &&

                  !selectedImage

                )

              }

              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"

            >

              {loading

                ? "Thinking..."

                : "Send"}

            </button>

          </div>

        </div>

        <p className="mt-3 text-center text-xs text-slate-600">

          SchoolBuddy can make mistakes.

          Always verify important information.

        </p>

      </section>

    </main>

  );

}