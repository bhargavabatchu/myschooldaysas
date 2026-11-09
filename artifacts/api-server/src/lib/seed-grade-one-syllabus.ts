import type { PoolClient } from "pg";

type TopicSeed = {
  title: string;
  description?: string;
  reference?: { title: string; url: string; description: string };
};

type LessonSeed = {
  title: string;
  description: string;
  topics: TopicSeed[];
};

type SubjectSeed = {
  name: string;
  lessons: LessonSeed[];
};

const primaryCurriculumUrl = "https://cisce.org/wp-content/uploads/2025/03/PrimaryCurriculum.pdf";

const gradeOneSubjects: SubjectSeed[] = [
  {
    name: "English",
    lessons: [
      {
        title: "Letters, sounds and words",
        description: "CISCE-aligned starter for early literacy; adjust word lists to the school's prescribed reader.",
        topics: [
          { title: "Letter names and sounds", description: "Recognise and say the sounds represented by familiar letters." },
          { title: "Vowels and consonants", description: "Identify vowels and consonants in simple words." },
          { title: "Blend and build words", description: "Blend sounds and read or make short, familiar words." },
        ],
      },
      {
        title: "Reading simple sentences",
        description: "Build confidence with short, age-appropriate texts.",
        topics: [
          { title: "Common sight words", description: "Read frequently used words in context." },
          { title: "Picture clues", description: "Use illustrations and context to understand a short text." },
          { title: "Read aloud", description: "Read short sentences clearly and listen to a story." },
        ],
      },
      {
        title: "Words and sentences",
        description: "Use familiar words to communicate ideas in complete sentences.",
        topics: [
          { title: "Naming words", description: "Name people, places, animals and things." },
          { title: "Action and describing words", description: "Use simple verbs and describing words." },
          { title: "Make a sentence", description: "Write a simple sentence with spacing, a capital letter and a full stop." },
        ],
      },
      {
        title: "Listening, speaking and early writing",
        description: "Practise listening carefully and sharing ideas in a few clear sentences.",
        topics: [
          { title: "Follow and give instructions", description: "Listen to and give short, clear instructions." },
          { title: "Retell a story", description: "Describe the beginning, middle and end of a familiar story." },
          { title: "Labels and short messages", description: "Write labels, captions and simple personal messages." },
        ],
      },
    ],
  },
  {
    name: "Mathematics",
    lessons: [
      {
        title: "Numbers and place value",
        description: "CISCE-aligned starter covering number sense and early place value.",
        topics: [
          { title: "Count, read and write numbers", description: "Count objects and read or write numbers to 100." },
          { title: "Compare and order", description: "Use more, fewer, equal, before and after to compare numbers." },
          { title: "Tens and ones", description: "Group objects into tens and ones to show two-digit numbers." },
        ],
      },
      {
        title: "Addition and subtraction",
        description: "Use objects, pictures and number sentences to solve simple problems.",
        topics: [
          { title: "Number bonds", description: "Find pairs of numbers that make 10 and other small totals." },
          { title: "Add and subtract", description: "Add and subtract within 20 using objects and drawings." },
          { title: "Everyday word problems", description: "Choose addition or subtraction for a one-step story problem." },
        ],
      },
      {
        title: "Shapes, patterns and position",
        description: "Notice and describe shapes and patterns in the classroom and home.",
        topics: [
          { title: "Flat and solid shapes", description: "Recognise common 2D shapes and familiar 3D objects." },
          { title: "Create and continue patterns", description: "Continue repeating patterns using shapes, colours or numbers." },
          { title: "Position words", description: "Describe position using words such as above, below, beside and between." },
        ],
      },
      {
        title: "Measurement, time and data",
        description: "Connect simple measurement ideas to daily routines.",
        topics: [
          { title: "Compare length, weight and capacity", description: "Compare and describe objects using everyday language." },
          { title: "Days and daily time", description: "Name the days of the week and order familiar daily events." },
          { title: "Money and picture data", description: "Recognise common coins and answer simple questions from a picture chart." },
        ],
      },
    ],
  },
  {
    name: "Science",
    lessons: [
      {
        title: "Myself and my body",
        description: "Part of an integrated, thematic EVS approach for Classes I–II in the CISCE Primary Curriculum.",
        topics: [
          { title: "Body parts and senses", description: "Identify main body parts and explore the five senses." },
          { title: "Healthy habits", description: "Practise hygiene, rest, exercise and asking an adult for help." },
          { title: "Feelings and care", description: "Recognise feelings and show care for oneself and others." },
        ],
      },
      {
        title: "Plants and animals around us",
        description: "Observe living things nearby and describe what they need.",
        topics: [
          {
            title: "Plants in our surroundings",
            description: "Notice roots, stems, leaves, flowers and the conditions plants need.",
            reference: {
              title: "CISCE Primary Curriculum (Classes I–V)",
              url: primaryCurriculumUrl,
              description: "Official primary curriculum framework; EVS in Classes I–II uses an integrated thematic approach.",
            },
          },
          { title: "Animals and their homes", description: "Compare familiar animals and the places where they live." },
          { title: "Care for living things", description: "Describe kind and safe ways to care for plants and animals." },
        ],
      },
      {
        title: "Food, water and weather",
        description: "Explore everyday needs and changes in the local environment.",
        topics: [
          { title: "Food for health", description: "Talk about a variety of foods and healthy eating habits." },
          { title: "Water in daily life", description: "Identify uses of water and ways to avoid wasting it." },
          { title: "Weather and seasons", description: "Observe local weather and choose suitable clothing or activities." },
        ],
      },
      {
        title: "Caring for our environment",
        description: "Build simple habits that keep shared spaces clean and safe.",
        topics: [
          { title: "Air, land and water", description: "Notice the natural parts of the environment around us." },
          { title: "Natural and made by people", description: "Sort familiar things as natural or made by people." },
          { title: "Reduce waste", description: "Practise putting waste in the right place and reusing suitable materials." },
        ],
      },
    ],
  },
  {
    name: "Social Studies",
    lessons: [
      {
        title: "My family and home",
        description: "CISCE-aligned integrated EVS themes, connected to children's familiar experiences.",
        topics: [
          { title: "People who care for me", description: "Talk about family and trusted people who help us." },
          { title: "Homes and rooms", description: "Describe different homes and how rooms are used." },
          { title: "Care and responsibility", description: "Share simple responsibilities at home and respect differences." },
        ],
      },
      {
        title: "My school and community",
        description: "Learn how people and places help a community work together.",
        topics: [
          { title: "Places in my school", description: "Identify familiar school spaces and how to use them responsibly." },
          { title: "Community helpers", description: "Recognise people who help keep the community healthy and safe." },
          { title: "Rules and cooperation", description: "Explain why shared rules, kindness and taking turns matter." },
        ],
      },
      {
        title: "Getting around safely",
        description: "Connect transport and safety to familiar journeys.",
        topics: [
          { title: "Ways to travel", description: "Compare common ways people travel on land, water and in the air." },
          { title: "Road and travel safety", description: "Practise simple safety rules and identify trusted adults." },
          { title: "Places near us", description: "Describe familiar places in the neighbourhood and how people use them." },
        ],
      },
      {
        title: "India and our celebrations",
        description: "Explore belonging, traditions and shared national identity with respect.",
        topics: [
          { title: "Our country", description: "Recognise India on a map or globe and learn a few national symbols." },
          { title: "Festivals and traditions", description: "Share how families and communities celebrate in different ways." },
          { title: "Caring for shared places", description: "Suggest ways to care for school, neighbourhood and public spaces." },
        ],
      },
    ],
  },
  {
    name: "Hindi",
    lessons: [
      {
        title: "स्वर और व्यंजन",
        description: "कक्षा 1 के लिए सरल भाषा-अभ्यास; विद्यालय की निर्धारित पुस्तक के अनुसार क्रम बदलें।",
        topics: [
          { title: "स्वरों की पहचान", description: "स्वरों को पहचानें और स्पष्ट बोलें।" },
          { title: "व्यंजनों की पहचान", description: "व्यंजनों को पहचानें और उनसे शुरू होने वाले शब्द बोलें।" },
          { title: "अक्षर लिखना", description: "अक्षरों को सही दिशा और आकार में लिखने का अभ्यास करें।" },
        ],
      },
      {
        title: "मात्राएँ और सरल शब्द",
        description: "मात्राओं की ध्वनि सुनकर परिचित शब्द पढ़ें और लिखें।",
        topics: [
          { title: "आ की मात्रा", description: "आ की मात्रा वाले परिचित शब्द पढ़ें और लिखें।" },
          { title: "इ और ई की मात्राएँ", description: "इ और ई की ध्वनियों में अंतर पहचानें।" },
          { title: "चित्र से शब्द", description: "चित्र देखकर सही शब्द बोलें और लिखें।" },
        ],
      },
      {
        title: "शब्दों से वाक्य",
        description: "बच्चों के परिचित विषयों पर छोटे वाक्य बनाएँ।",
        topics: [
          { title: "नाम वाले शब्द", description: "व्यक्ति, स्थान, पशु और वस्तु के नाम पहचानें।" },
          { title: "सरल वाक्य पढ़ना", description: "छोटे वाक्य पढ़ें और उनका अर्थ समझें।" },
          { title: "वाक्य लिखना", description: "साफ़ अक्षरों और उचित अंतर के साथ छोटे वाक्य लिखें।" },
        ],
      },
      {
        title: "कविता और कहानी",
        description: "सुनने, बोलने, पढ़ने और लिखने में आत्मविश्वास बढ़ाएँ।",
        topics: [
          { title: "कविता सुनना और बोलना", description: "लय के साथ छोटी कविता सुनें और दोहराएँ।" },
          { title: "कहानी समझना", description: "कहानी के पात्र और घटनाएँ पहचानें।" },
          { title: "अपनी बात कहना", description: "चित्र या अनुभव के बारे में सरल वाक्यों में बताएँ।" },
        ],
      },
    ],
  },
  {
    name: "Computer Science",
    lessons: [
      {
        title: "Meet the computer",
        description: "A gentle introduction to classroom technology and responsible use.",
        topics: [
          { title: "Digital devices around us", description: "Recognise computers, tablets and other familiar digital devices." },
          { title: "Parts of a computer", description: "Identify the screen, keyboard, mouse and system unit where present." },
          { title: "Care for devices", description: "Use clean hands, gentle touch and teacher guidance when using equipment." },
        ],
      },
      {
        title: "Using a keyboard and mouse",
        description: "Practise basic control and input skills with adult guidance.",
        topics: [
          { title: "Keyboard keys", description: "Find letters, numbers, space, enter and backspace." },
          { title: "Mouse actions", description: "Practise pointing, clicking and dragging." },
          { title: "Type familiar words", description: "Type a name or short word with support." },
        ],
      },
      {
        title: "Create with digital tools",
        description: "Use a simple, teacher-approved app to make and save a small creation.",
        topics: [
          { title: "Open and close an app", description: "Follow steps to open and close a classroom application." },
          { title: "Draw with shapes and colours", description: "Make a simple picture using drawing tools." },
          { title: "Save with help", description: "Save work using the classroom's agreed file name and location." },
        ],
      },
      {
        title: "Safe and balanced technology use",
        description: "Build healthy habits and know when to ask an adult for help.",
        topics: [
          { title: "Private information", description: "Do not share personal information without a trusted adult." },
          { title: "Ask before clicking", description: "Use only teacher-approved websites and links." },
          { title: "Screen breaks", description: "Take breaks and balance screen activities with movement and play." },
        ],
      },
    ],
  },
  {
    name: "Arts",
    lessons: [
      {
        title: "Lines, shapes and colours",
        description: "Explore materials and communicate ideas through visual art.",
        topics: [
          { title: "Lines and marks", description: "Make different lines and marks with drawing tools." },
          { title: "Shapes in pictures", description: "Combine simple shapes to draw familiar objects." },
          { title: "Colour choices", description: "Name and use colours to express an idea or feeling." },
        ],
      },
      {
        title: "Drawing what I see",
        description: "Observe familiar objects and represent a few of their details.",
        topics: [
          { title: "Objects at home and school", description: "Draw an object by noticing its shape and parts." },
          { title: "Nature sketches", description: "Notice patterns, leaves, flowers or clouds before drawing." },
          { title: "Tell a story with a picture", description: "Create a picture that shows an event or idea." },
        ],
      },
      {
        title: "Paper, texture and craft",
        description: "Make art safely using age-appropriate materials.",
        topics: [
          { title: "Tear, fold and arrange", description: "Explore paper shapes and arrange them into a picture." },
          { title: "Texture collage", description: "Combine safe materials with different textures." },
          { title: "Use tools safely", description: "Follow adult instructions when using classroom art tools." },
        ],
      },
      {
        title: "Patterns and art around us",
        description: "Notice patterns in nature and in the school's local community.",
        topics: [
          { title: "Repeating patterns", description: "Create a simple repeated shape or colour pattern." },
          { title: "Art from local surroundings", description: "Look at local designs and describe what stands out." },
          { title: "Share and appreciate", description: "Talk about one's own artwork and respond kindly to others' work." },
        ],
      },
    ],
  },
  {
    name: "Physical Education",
    lessons: [
      {
        title: "Movement and coordination",
        description: "Develop confidence in moving safely in shared spaces.",
        topics: [
          { title: "Warm-up and cool-down", description: "Join simple movements before and after activity." },
          { title: "Balance and body control", description: "Practise balancing, stopping and changing direction." },
          { title: "Move in different ways", description: "Walk, hop, jump and skip in a safe area." },
        ],
      },
      {
        title: "Games and cooperation",
        description: "Enjoy active play while learning to follow shared rules.",
        topics: [
          { title: "Take turns", description: "Wait, share equipment and take turns in a group game." },
          { title: "Work as a team", description: "Cooperate and encourage classmates during simple activities." },
          { title: "Fair play", description: "Follow rules and respond kindly when a game ends." },
        ],
      },
      {
        title: "Fitness and wellbeing",
        description: "Connect movement with healthy daily habits.",
        topics: [
          { title: "Stretch and move", description: "Try age-appropriate stretches and simple fitness activities." },
          { title: "Hydration and rest", description: "Recognise the need for water and rest after activity." },
          { title: "Notice how I feel", description: "Describe how the body feels before and after exercise." },
        ],
      },
      {
        title: "Safety and sportsmanship",
        description: "Use equipment and play areas responsibly.",
        topics: [
          { title: "Safe play space", description: "Keep enough space and follow the teacher's safety signals." },
          { title: "Use equipment carefully", description: "Carry, share and return equipment safely." },
          { title: "Respect others", description: "Celebrate effort, include others and ask for help when needed." },
        ],
      },
    ],
  },
];

export async function seedGradeOneSyllabus(
  client: PoolClient,
  orgId: string,
  classId: string,
  adminId: string,
) {
  const names = gradeOneSubjects.map((subject) => subject.name);
  const subjects = await client.query<{ id: string; name: string }>(
    `SELECT id, name
       FROM academic.subjects
      WHERE org_id=$1 AND is_active=true AND name=ANY($2::text[])`,
    [orgId, names],
  );
  const subjectIds = new Map(subjects.rows.map((subject) => [subject.name, subject.id]));

  for (const subject of gradeOneSubjects) {
    const subjectId = subjectIds.get(subject.name);
    if (!subjectId) throw new Error(`Could not find the active Grade 1 subject ${subject.name}.`);

    await client.query(
      `INSERT INTO learning.syllabi (org_id, class_id, subject_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4)
       ON CONFLICT (org_id, class_id, subject_id) DO NOTHING`,
      [orgId, classId, subjectId, adminId],
    );
    const syllabus = await client.query<{ id: string }>(
      `SELECT id FROM learning.syllabi
        WHERE org_id=$1 AND class_id=$2 AND subject_id=$3`,
      [orgId, classId, subjectId],
    );
    const syllabusId = syllabus.rows[0]?.id;
    if (!syllabusId) throw new Error(`Could not load the Grade 1 ${subject.name} syllabus.`);

    const existingContent = await client.query(
      `SELECT 1 FROM learning.syllabus_lessons
        WHERE org_id=$1 AND syllabus_id=$2
        LIMIT 1`,
      [orgId, syllabusId],
    );
    if (existingContent.rowCount) continue;

    for (const [lessonPosition, lesson] of subject.lessons.entries()) {
      const createdLesson = await client.query<{ id: string }>(
        `INSERT INTO learning.syllabus_lessons
           (org_id, syllabus_id, title, description, position, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         RETURNING id`,
        [orgId, syllabusId, lesson.title, lesson.description, lessonPosition, adminId],
      );
      const lessonId = createdLesson.rows[0]?.id;
      if (!lessonId) throw new Error(`Could not seed Grade 1 ${subject.name}: ${lesson.title}.`);

      for (const [topicPosition, topic] of lesson.topics.entries()) {
        const createdTopic = await client.query<{ id: string }>(
          `INSERT INTO learning.syllabus_topics
             (org_id, lesson_id, title, description, position, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$6)
           RETURNING id`,
          [orgId, lessonId, topic.title, topic.description ?? "", topicPosition, adminId],
        );
        const topicId = createdTopic.rows[0]?.id;
        if (!topicId) throw new Error(`Could not seed Grade 1 ${subject.name}: ${topic.title}.`);

        if (topic.reference) {
          await client.query(
            `INSERT INTO learning.syllabus_materials
               (org_id, topic_id, title, kind, url, description, position, created_by, updated_by)
             VALUES ($1,$2,$3,'document',$4,$5,0,$6,$6)`,
            [orgId, topicId, topic.reference.title, topic.reference.url, topic.reference.description, adminId],
          );
        }
      }
    }
  }
}
