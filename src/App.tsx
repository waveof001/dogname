/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music, 
  Trophy, 
  Play, 
  Users, 
  Timer, 
  Zap, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Star,
  TrendingUp,
  UserCircle,
  GraduationCap
} from 'lucide-react';
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow';

// --- Types ---
type GameStatus = 'waiting' | 'playing' | 'finished';
type UserRole = 'teacher' | 'student' | null;

interface Game {
  id: string;
  status: GameStatus;
  hostId: string;
  startTime?: any;
  duration: number;
}

interface Player {
  id: string;
  nickname: string;
  score: number;
  streak: number;
  lastAnswerTime?: any;
  isHost: boolean;
}

const NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const GAME_DURATION = 60; // 초 단위

// --- Components ---

const VexNote = ({ note }: { note: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous rendering
    containerRef.current.innerHTML = '';

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(200, 150);
    const context = renderer.getContext();
    
    // Create a stave of width 150 at position 10, 20 on the canvas.
    const stave = new Stave(10, 20, 150);
    stave.addClef('treble').setContext(context).draw();

    // Mapping for VexFlow (C4, D4, etc.)
    const noteMap: Record<string, string> = {
      'C': 'c/4',
      'D': 'd/4',
      'E': 'e/4',
      'F': 'f/4',
      'G': 'g/4',
      'A': 'a/4',
      'B': 'b/4',
    };

    const vexNote = new StaveNote({
      clef: 'treble',
      keys: [noteMap[note]],
      duration: 'q',
    });

    // Add ledger lines if needed (VexFlow handles this automatically based on keys)
    const voice = new Voice({ numBeats: 1, beatValue: 4 });
    voice.addTickables([vexNote]);

    new Formatter().joinVoices([voice]).format([voice], 100);
    voice.draw(context, stave);
  }, [note]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-2xl shadow-white/10 flex items-center justify-center">
      <div ref={containerRef} />
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [nickname, setNickname] = useState('');
  const [gameIdInput, setGameIdInput] = useState('');
  const [currentNote, setCurrentNote] = useState(NOTES[Math.floor(Math.random() * NOTES.length)]);
  const [lastAnswerResult, setLastAnswerResult] = useState<{ correct: boolean; bonus?: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [isJoining, setIsJoining] = useState(false);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth);
      }
    });
    return unsubscribe;
  }, []);

  // --- Game Sync ---
  useEffect(() => {
    if (!game?.id) return;

    const gameRef = doc(db, 'games', game.id);
    const unsubGame = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        setGame({ id: doc.id, ...doc.data() } as Game);
      }
    });

    const playersRef = collection(db, 'games', game.id, 'players');
    const unsubPlayers = onSnapshot(query(playersRef, orderBy('score', 'desc')), (snapshot) => {
      const pData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setPlayers(pData);
    });

    return () => {
      unsubGame();
      unsubPlayers();
    };
  }, [game?.id]);

  // --- Timer ---
  useEffect(() => {
    if (game?.status !== 'playing') return;

    const interval = setInterval(() => {
      const start = game.startTime?.toMillis() || Date.now();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, game.duration - elapsed);
      setTimeLeft(remaining);

      if (remaining === 0 && game.hostId === user?.uid) {
        updateDoc(doc(db, 'games', game.id), { status: 'finished' });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [game?.status, game?.startTime, game?.duration, game?.id, game?.hostId, user?.uid]);

  // --- Actions ---
  const createGame = async () => {
    if (!user || !nickname) return;
    const newGameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const gameData: Partial<Game> = {
      status: 'waiting',
      hostId: user.uid,
      duration: GAME_DURATION,
    };

    await setDoc(doc(db, 'games', newGameId), gameData);
    await setDoc(doc(db, 'games', newGameId, 'players', user.uid), {
      nickname,
      score: 0,
      streak: 0,
      isHost: true,
    });
    setGame({ id: newGameId, ...gameData } as Game);
  };

  const joinGame = async () => {
    if (!user || !nickname || !gameIdInput) return;
    setIsJoining(true);
    try {
      const gId = gameIdInput.toUpperCase();
      const gDoc = await getDoc(doc(db, 'games', gId));
      if (gDoc.exists()) {
        await setDoc(doc(db, 'games', gId, 'players', user.uid), {
          nickname,
          score: 0,
          streak: 0,
          isHost: false,
        });
        setGame({ id: gId, ...gDoc.data() } as Game);
      } else {
        alert('게임을 찾을 수 없습니다!');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsJoining(false);
    }
  };

  const startGame = async () => {
    if (!game || game.hostId !== user?.uid) return;
    await updateDoc(doc(db, 'games', game.id), {
      status: 'playing',
      startTime: serverTimestamp(),
    });
  };

  const handleAnswer = async (note: string) => {
    if (!game || !user || game.status !== 'playing') return;

    const isCorrect = note === currentNote;
    const player = players.find(p => p.id === user.uid);
    if (!player) return;

    let points = 0;
    let bonusText = '';
    let newStreak = isCorrect ? player.streak + 1 : 0;

    if (isCorrect) {
      const now = Date.now();
      const lastTime = player.lastAnswerTime || (game.startTime?.toMillis() || now);
      const timeTaken = now - lastTime;
      const speedBonus = Math.max(0, 1000 - Math.floor(timeTaken / 10));
      points = 1000 + speedBonus + (newStreak * 100);

      const luck = Math.random();
      if (luck < 0.1) {
        const event = Math.random();
        if (event < 0.4) {
          points *= 2;
          bonusText = '더블! x2';
        } else if (event < 0.8) {
          points += 5000;
          bonusText = '잭팟! +5000';
        } else {
          points = -500;
          bonusText = '꽝! -500';
        }
      }
    } else {
      points = -200;
    }

    setLastAnswerResult({ correct: isCorrect, bonus: bonusText });
    setTimeout(() => setLastAnswerResult(null), 1000);

    await updateDoc(doc(db, 'games', game.id, 'players', user.uid), {
      score: Math.max(0, player.score + points),
      streak: newStreak,
      lastAnswerTime: Date.now(),
    });

    setCurrentNote(NOTES[Math.floor(Math.random() * NOTES.length)]);
  };

  // --- Views ---

  if (!role) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-4">
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-xl shadow-indigo-500/20">
              <Music className="w-12 h-12" />
            </div>
          </div>
          <h1 className="text-5xl font-black tracking-tighter mb-2 italic">계이름 퀴즈</h1>
          <p className="text-indigo-300 font-medium">실시간 음악 계이름 맞추기 배틀</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <button 
            onClick={() => setRole('teacher')}
            className="group relative overflow-hidden bg-white/5 border border-white/10 hover:border-indigo-500 p-8 rounded-3xl transition-all flex flex-col items-center gap-4"
          >
            <div className="bg-indigo-500/20 p-4 rounded-2xl group-hover:bg-indigo-500 transition-colors">
              <UserCircle className="w-12 h-12" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-1">선생님용</h3>
              <p className="text-white/50 text-sm">게임을 생성하고 학생들을 초대합니다.</p>
            </div>
          </button>

          <button 
            onClick={() => setRole('student')}
            className="group relative overflow-hidden bg-white/5 border border-white/10 hover:border-green-500 p-8 rounded-3xl transition-all flex flex-col items-center gap-4"
          >
            <div className="bg-green-500/20 p-4 rounded-2xl group-hover:bg-green-500 transition-colors">
              <GraduationCap className="w-12 h-12" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-1">학생용</h3>
              <p className="text-white/50 text-sm">참여 코드를 입력하여 게임에 입장합니다.</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 font-sans">
        <button 
          onClick={() => setRole(null)}
          className="absolute top-6 left-6 text-white/50 hover:text-white flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4" />
          뒤로 가기
        </button>

        <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {role === 'teacher' ? '게임 만들기' : '게임 참여하기'}
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">닉네임</label>
              <input 
                type="text" 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="이름을 입력하세요..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                maxLength={15}
              />
            </div>

            {role === 'teacher' ? (
              <button 
                onClick={createGame}
                disabled={!nickname}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl transition-all font-bold group text-lg"
              >
                <Play className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span>게임 생성하기</span>
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-green-400 mb-2">참여 코드</label>
                  <input 
                    type="text" 
                    value={gameIdInput}
                    onChange={(e) => setGameIdInput(e.target.value.toUpperCase())}
                    placeholder="6자리 코드 입력..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center font-mono text-2xl focus:outline-none focus:border-green-500"
                  />
                </div>
                <button 
                  onClick={joinGame}
                  disabled={!nickname || !gameIdInput || isJoining}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 py-4 rounded-2xl font-bold text-lg transition-all"
                >
                  {isJoining ? '입장 중...' : '게임 입장하기'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (game.status === 'waiting') {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6 flex flex-col items-center">
        <div className="w-full max-w-4xl flex flex-col items-center">
          <div className="bg-indigo-600 px-12 py-6 rounded-3xl shadow-2xl shadow-indigo-500/20 mb-12 text-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <span className="text-xs font-black uppercase tracking-[0.3em] opacity-70">참여 코드</span>
            <h2 className="text-6xl font-black tracking-tighter font-mono">{game.id}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="text-indigo-400" />
                  참여 학생 ({players.length}명)
                </h3>
                {role === 'teacher' && (
                  <button 
                    onClick={startGame}
                    disabled={players.length < 1}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 px-10 py-4 rounded-2xl font-black text-xl transition-all shadow-lg shadow-green-500/20"
                  >
                    게임 시작!
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <AnimatePresence>
                  {players.map((p) => (
                    <motion.div 
                      key={p.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-3"
                    >
                      <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 font-bold">
                        {p.nickname[0].toUpperCase()}
                      </div>
                      <span className="font-bold truncate">{p.nickname}</span>
                      {p.isHost && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 ml-auto" />}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 text-indigo-400 mb-4 animate-bounce" />
              <h4 className="font-bold text-xl mb-2">
                {role === 'teacher' ? '학생들을 기다리는 중' : '선생님을 기다리는 중'}
              </h4>
              <p className="text-indigo-300/70">
                {role === 'teacher' ? '모든 학생이 입장하면 시작 버튼을 눌러주세요.' : '선생님이 게임을 시작할 때까지 잠시만 기다려주세요!'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (game.status === 'playing') {
    const myPlayer = players.find(p => p.id === user?.uid);
    const topPlayers = players.slice(0, 5);

    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white/5 border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-black italic leading-none">계이름 퀴즈</h2>
              <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold">실시간 배틀 중</span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase font-bold text-white/50">남은 시간</span>
              <div className={cn(
                "flex items-center gap-2 font-mono text-2xl font-black",
                timeLeft < 10 ? "text-red-500 animate-pulse" : "text-white"
              )}>
                <Timer className="w-5 h-5" />
                {timeLeft}초
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-white/50">내 점수</span>
              <div className="text-2xl font-black text-indigo-400">
                {myPlayer?.score.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Main Game Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
            {/* Feedback Overlay */}
            <AnimatePresence>
              {lastAnswerResult && (
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  className="absolute top-1/4 z-50 pointer-events-none"
                >
                  {lastAnswerResult.correct ? (
                    <div className="flex flex-col items-center">
                      <CheckCircle2 className="w-20 h-20 text-green-500 mb-2" />
                      {lastAnswerResult.bonus && (
                        <span className="bg-yellow-500 text-black px-6 py-2 rounded-full font-black text-2xl animate-bounce shadow-xl">
                          {lastAnswerResult.bonus}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <XCircle className="w-20 h-20 text-red-500 mb-2" />
                      <span className="bg-red-500 text-white px-4 py-1 rounded-full font-bold">-200점!</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mb-12 flex flex-col items-center">
              <div className="mb-6 flex items-center gap-2">
                <Zap className={cn("w-8 h-8", (myPlayer?.streak || 0) > 0 ? "text-yellow-500 fill-yellow-500" : "text-white/20")} />
                <span className="text-2xl font-black italic">콤보: {myPlayer?.streak}</span>
              </div>
              <VexNote note={currentNote} />
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 w-full max-w-2xl">
              {NOTES.map((note) => (
                <button
                  key={note}
                  onClick={() => handleAnswer(note)}
                  className="aspect-square bg-white/5 hover:bg-indigo-600 border border-white/10 hover:border-indigo-400 rounded-2xl flex items-center justify-center text-3xl font-black transition-all active:scale-95 shadow-lg"
                >
                  {note}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar Leaderboard */}
          <div className="w-full lg:w-80 bg-black/20 border-l border-white/10 p-6 flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-6 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              실시간 순위
            </h3>
            <div className="space-y-3">
              {topPlayers.map((p, i) => (
                <div 
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl border transition-all",
                    p.id === user?.uid ? "bg-indigo-600/20 border-indigo-500/50" : "bg-white/5 border-white/10"
                  )}
                >
                  <span className="font-mono font-black text-white/30 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{p.nickname}</div>
                    <div className="text-xs font-mono text-white/50">{p.score.toLocaleString()} 점</div>
                  </div>
                  {p.streak > 2 && (
                    <div className="flex items-center gap-1 text-[10px] font-black text-yellow-500">
                      <TrendingUp className="w-3 h-3" />
                      {p.streak}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (game.status === 'finished') {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winners = sortedPlayers.slice(0, 3);

    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6 flex flex-col items-center justify-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-2xl text-center"
        >
          <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-6 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]" />
          <h1 className="text-6xl font-black italic tracking-tighter mb-12">최종 순위 발표</h1>

          <div className="flex items-end justify-center gap-4 mb-16 h-64">
            {/* 2nd Place */}
            {winners[1] && (
              <motion.div 
                initial={{ height: 0 }}
                animate={{ height: '70%' }}
                className="flex-1 bg-slate-700/50 border border-slate-500/30 rounded-t-3xl flex flex-col items-center justify-end p-6 relative"
              >
                <div className="absolute -top-12 flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-400 rounded-full flex items-center justify-center text-2xl font-bold mb-2">2</div>
                  <span className="font-bold truncate w-24 text-center">{winners[1].nickname}</span>
                </div>
                <span className="font-mono font-black text-slate-400">{winners[1].score.toLocaleString()}</span>
              </motion.div>
            )}

            {/* 1st Place */}
            {winners[0] && (
              <motion.div 
                initial={{ height: 0 }}
                animate={{ height: '100%' }}
                className="flex-1 bg-indigo-600/50 border border-indigo-400/50 rounded-t-3xl flex flex-col items-center justify-end p-6 relative"
              >
                <div className="absolute -top-16 flex flex-col items-center">
                  <Star className="w-10 h-10 text-yellow-500 fill-yellow-500 mb-2 animate-pulse" />
                  <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center text-3xl font-bold text-black mb-2 ring-4 ring-yellow-500/20">1</div>
                  <span className="font-bold truncate w-32 text-center text-xl">{winners[0].nickname}</span>
                </div>
                <span className="font-mono font-black text-yellow-500 text-2xl">{winners[0].score.toLocaleString()}</span>
              </motion.div>
            )}

            {/* 3rd Place */}
            {winners[2] && (
              <motion.div 
                initial={{ height: 0 }}
                animate={{ height: '50%' }}
                className="flex-1 bg-amber-900/30 border border-amber-700/30 rounded-t-3xl flex flex-col items-center justify-end p-6 relative"
              >
                <div className="absolute -top-12 flex flex-col items-center">
                  <div className="w-14 h-14 bg-amber-700 rounded-full flex items-center justify-center text-xl font-bold mb-2">3</div>
                  <span className="font-bold truncate w-24 text-center">{winners[2].nickname}</span>
                </div>
                <span className="font-mono font-black text-amber-700">{winners[2].score.toLocaleString()}</span>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => {
                setGame(null);
                setRole(null);
              }}
              className="bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-black transition-all"
            >
              처음으로 돌아가기
            </button>
            {role === 'teacher' && (
              <button 
                onClick={async () => {
                  await updateDoc(doc(db, 'games', game.id), { status: 'waiting' });
                  const playersSnapshot = await getDocs(collection(db, 'games', game.id, 'players'));
                  playersSnapshot.forEach(async (pDoc) => {
                    await updateDoc(doc(db, 'games', game.id, 'players', pDoc.id), {
                      score: 0,
                      streak: 0
                    });
                  });
                }}
                className="bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-black transition-all"
              >
                다시 한 판 더!
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return null;
}
