const express = require('express');
const path = require('path');
const axios = require('axios');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const ejs = require('ejs');

// MongoDB connection
mongoose.connect('yourmongouri',{ /* useNewUrlParser: true, useUnifiedTopology: true */ })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

  const applicationSchema = new mongoose.Schema({
    name: String,
    description: String,
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    questions: [
      {
        type: { type: String, enum: ['short', 'paragraph', 'single-choice', 'multiple-choice'], required: true },
        question: String,
        options: [String], // For single-choice and multiple-choice
      },
    ],
    submissions: [
      {
        applicantName: String,
        responses: [mongoose.Schema.Types.Mixed], // Allows strings, objects, or any data type
        submittedAt: { type: Date, default: Date.now },
      },
    ],
  });
  
  
const Application = mongoose.model('Application', applicationSchema);

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use('/cdn', express.static(path.join(__dirname, 'src', 'cdnimages')))
app.use('/assets', express.static(path.join(__dirname, 'src', 'assets')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Define routes
app.get('/', (req, res) => {
  res.render('index');
});



app.get('/about', (req, res) => {
  res.render('about');
});

app.get('/projects', (req, res) => {
  res.render('projects');
});



app.get('/contact', (req, res) => {
  res.render('contact');
});

// Webhook for contact form
const DISCORD_WEBHOOK_URL = "YOURWEBHOOK";

app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;

  const embed = {
    username: 'QuantumLabs Contact Bot',
    embeds: [
      {
        title: 'New Contact Form Submission',
        color: 0xF39C12,
        fields: [
          { name: 'Name', value: name, inline: true },
          { name: 'Email', value: email, inline: true },
          { name: 'Message', value: message, inline: false },
        ],
        footer: { text: 'Contact Form Submission' },
        timestamp: new Date(),
      },
    ],
  };

  try {
    await axios.post(DISCORD_WEBHOOK_URL, embed);
    res.render('contact', { successMessage: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error sending webhook:', error);
    res.status(500).render('contact', { successMessage: 'Error sending message.' });
  }
});

// Applications routes
app.get('/applications', async (req, res) => {
  const applications = await Application.find();
  const hasOpenApplications = applications.some(app => app.status === 'open');
  res.render('applications', { applications, hasOpenApplications });
});


app.get('/applications/:id/apply', async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application || application.status === 'closed') {
    return res.status(404).send('Application is closed or does not exist.');
  }
  res.render('apply', { application, successMessage: null }); // Ensure successMessage is always passed
});


app.post('/applications/:id/apply', async (req, res) => {
  const { name, responses } = req.body;
  const application = await Application.findById(req.params.id);

  if (!application) {
    return res.status(404).send('Application not found.');
  }

  const formattedResponses = application.questions.map((question, index) => {
    const response = responses[index];
    if (typeof response === 'object') {
      return JSON.stringify(response); // Convert object to string
    }
    return response; // Keep as is for strings
  });

  application.submissions.push({
    applicantName: name,
    responses: formattedResponses,
  });
  
  await application.save();

  res.render('apply', { application, successMessage: 'Application submitted successfully!' });
});

const authenticateAdmin = require('./auth');

// Admin panel - list applications
app.get('/admin/applications', authenticateAdmin, async (req, res) => {
  const applications = await Application.find();
  res.render('admin/applications', { applications });
});

// Admin panel - add new application
app.get('/admin/applications/new', authenticateAdmin, (req, res) => {
  res.render('admin/newApplication');
});

// Admin panel - update application status
app.post('/admin/applications/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  await Application.findByIdAndUpdate(req.params.id, { status });
  res.redirect('/admin/applications');
});

app.post('/admin/applications', authenticateAdmin, async (req, res) => {
  const { name, description, status, questions } = req.body;

  const formattedQuestions = questions.map(q => {
    if (q.type === 'single-choice' || q.type === 'multiple-choice') {
      // Split options and filter out empty values
      q.options = q.options.split(',').map(option => option.trim()).filter(option => option !== '');
    }
    return q;
  });

  await Application.create({
    name,
    description,
    status,
    questions: formattedQuestions
  });

  res.redirect('/admin/applications');
});


// Admin panel - delete application
app.post('/admin/applications/:id/delete', authenticateAdmin, async (req, res) => {
  await Application.findByIdAndDelete(req.params.id);
  res.redirect('/admin/applications');
});


// View submissions for a specific application
app.get('/admin/applications/:id/submissions', async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) {
      return res.status(404).send('Application not found');
    }
    // Render the submissions page with the list of submissions
    res.render('admin/viewSubmissions', { application });
  } catch (err) {
    console.log(err);
    res.status(500).send('Error loading submissions');
  }
});



app.get('/admin/applications/:applicationId/submissions/:submissionId', async (req, res) => {
  try {
    const application = await Application.findById(req.params.applicationId);
    const submission = application.submissions.id(req.params.submissionId);
    if (!submission) {
      return res.status(404).send('Submission not found');
    }
    res.render('admin/viewSubmissionDetail', { application, submission });
  } catch (err) {
    console.log(err);
    res.status(500).send('Error loading submission details');
  }
});


// Update submission status (e.g., approve, reject)
app.post('/admin/applications/:applicationId/submissions/:submissionId', async (req, res) => {
  try {
    const { status } = req.body;
    const application = await Application.findById(req.params.applicationId);
    const submission = application.submissions.id(req.params.submissionId);
    submission.status = status;
    await application.save();
    res.redirect(`/admin/applications/${req.params.applicationId}/submissions/${req.params.submissionId}`);
  } catch (err) {
    console.log(err);
    res.status(500).send('Error updating submission');
  }
});

// Start the server
const PORT = process.env.PORT || 10004;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
