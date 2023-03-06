import React from 'react';
import ReactDOM from 'react-dom/client';
import App, {
  FirebaseInfo,
  MTurkInfo,
  ProlificInfo,
  ProlificWorkspace,
  StudyTable,
} from './App';
import ErrorPage from './components/errorPage';
import { createBrowserRouter, defer, RouterProvider } from 'react-router-dom';
import { CssBaseline } from '@mui/material';

// These are React Router routes (client-side)
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <StudyTable />,
        loader: async () => fetch('/api/studies'),
      },

      {
        path: '/mturk',
        element: <MTurkInfo />,
        loader: async ({ request }) => {
          const url = new URL(request.url);
          const sandbox = url.searchParams.get('sandbox');
          let balance = fetch(
            `/api/mturk/balance?${sandbox ? 'sandbox=1' : ''}`
          ).then((res) => res.json());
          let hits = fetch(
            `/api/mturk/hits?${sandbox ? 'sandbox=1' : ''}`
          ).then((res) => res.json());
          return defer({
            sandbox: sandbox,
            balance: balance,
            hits: hits,
          });
        },
        // children: [
        //   {
        //     index: true,
        //     element: <AssignmentsList />,
        //     loader: async ({ request }) => {
        //       const url = new URL(request.url);
        //       const sandbox = url.searchParams.get('sandbox');
        //       let balance = fetch(
        //         `/api/mturk/assignments?${sandbox ? 'sandbox=1' : ''}`
        //       ).then((res) => res.json());
        //     },
        //   },
        // ],
      },

      {
        path: '/prolific',
        element: <ProlificInfo />,
        loader: async () => {
          let me = fetch('/api/prolific/me').then((res) => res.json());
          let workspaces = fetch('/api/prolific/workspaces').then((res) =>
            res.json()
          );
          return defer({
            me: me,
            workspaces: workspaces,
          });
        },
        children: [
          {
            path: '/prolific/:workspaceId',
            element: <ProlificWorkspace />,
            loader: async ({ params }) => {
              let workspace = fetch(
                `/api/prolific/workspaces/${params.workspaceId}`
              ).then((res) => res.json());
              return defer({
                workspace: workspace,
              });
            },
          },
        ],
      },

      {
        path: '/firebase',
        element: <FirebaseInfo />,
        loader: async () => {
          let projects = fetch('/api/firebase').then((res) => res.json());
          return defer({
            projects: projects,
          });
        },
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CssBaseline />
    <RouterProvider router={router} />
  </React.StrictMode>
);
