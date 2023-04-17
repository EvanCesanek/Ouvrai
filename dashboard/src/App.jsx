import {
  AppBar,
  Box,
  Card,
  Container,
  Divider,
  Drawer,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  MenuList,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Await,
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useNavigate,
} from 'react-router-dom';
import { Suspense, useState } from 'react';
import { ThreeDots } from 'react-loader-spinner';
import { ArrowBack, AttachMoney, MoreVert } from '@mui/icons-material';

const drawerWidth = 240;

function NavMenuItem(props) {
  return (
    <NavLink
      end
      to={props.to}
      style={{ textDecoration: 'none', color: 'black' }}>
      {({ isActive }) => <MenuItem selected={isActive}>{props.label}</MenuItem>}
    </NavLink>
  );
}

function AppMenu() {
  // HACK: separate isActive for MTurk and MTurk Sandbox via trailing slash
  return (
    <MenuList>
      <NavMenuItem to="/" label="My Studies" />
      <NavMenuItem to="/mturk" label="MTurk" />
      <NavMenuItem to="/mturk/?sandbox=1" label="MTurk Sandbox" />
      <NavMenuItem to="/prolific" label="Prolific" />
      <NavMenuItem to="/firebase" label="Firebase" />
    </MenuList>
  );
}

function Study(props) {
  let study = props.study;
  return (
    <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
      <TableCell scope="row">{study.name}</TableCell>
      <TableCell align="right">{study.site}</TableCell>
    </TableRow>
  );
}

export function StudyTable(props) {
  let studies = useLoaderData();
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Study</TableCell>
            <TableCell align="right">Hosting Site</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {studies.map((s) => (
            <Study study={s} key={s.name} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function HIT(props) {
  // All of this JS is for the HIT Action Menu
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const deletable =
    ['Reviewing', 'Reviewable'].includes(props.hit.HITStatus) &&
    props.hit.Assignments.every((a) => a.AssignmentStatus !== 'Submitted');
  const expired = Date.parse(props.hit.Expiration) - new Date() <= 0;
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleDelete = async () => {
    let res = await fetch(
      `/api/mturk/hits/${props.hit.HITId}?${props.sandbox ? 'sandbox=1' : ''}`,
      {
        method: 'DELETE',
      }
    );
    res = await res.json();
    console.log('delete HIT response', res);
    if (res.TurkErrorCode) {
      // failed to delete
      window.alert('Error: ' + res.message);
    }
    handleClose();
    navigate(0);
  };
  const handleExpire = async () => {
    let res = await fetch(
      `/api/mturk/hits/${props.hit.HITId}/expire?${
        props.sandbox ? 'sandbox=1' : ''
      }`,
      {
        method: 'POST',
      }
    );
    res = await res.json();
    console.log('expire HIT response', res);
    if (res.TurkErrorCode) {
      // failed to expire
      window.alert('Error: ' + res.message);
      return;
    }
    handleClose();
    navigate(0);
  };
  return (
    <TableRow>
      <TableCell>
        <IconButton size="small" onClick={handleClick}>
          <MoreVert />
        </IconButton>
        <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
          <MenuItem onClick={handleExpire} disabled={expired}>
            Expire
          </MenuItem>
          <MenuItem onClick={handleDelete} disabled={!deletable}>
            Delete
          </MenuItem>
        </Menu>
      </TableCell>
      <TableCell scope="row">{props.hit.RequesterAnnotation}</TableCell>
      <TableCell align="right">{props.hit.HITId}</TableCell>
      <TableCell align="right">{props.hit.HITStatus}</TableCell>
      <TableCell align="right">
        {props.hit.NumberOfAssignmentsAvailable}
      </TableCell>
      <TableCell align="right">
        {props.hit.NumberOfAssignmentsPending}
      </TableCell>
      {/* <TableCell align="right">
        {props.hit.NumberOfAssignmentsCompleted}
      </TableCell> */}
    </TableRow>
  );
}

function HITTable(props) {
  return (
    <TableContainer component={Paper}>
      <Table size="small" sx={{ whiteSpace: 'nowrap' }}>
        <TableHead>
          <TableRow>
            <TableCell></TableCell>
            <TableCell>Study</TableCell>
            <TableCell align="right">HIT ID</TableCell>
            <TableCell align="right">Status</TableCell>
            <TableCell align="right">Available</TableCell>
            <TableCell align="right">In Progress</TableCell>
            {/* <TableCell align="right">Completed</TableCell> */}
          </TableRow>
        </TableHead>
        <TableBody>
          {props.hits.map((s) => (
            <HIT sandbox={props.sandbox} hit={s} key={s.HITId} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function parseAnswer(xml) {
  let xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
  let answers = xmlDoc.getElementsByTagName('Answer');
  let out = {};
  for (let ans of answers) {
    out[ans.children[0].innerHTML] = ans.children[1].innerHTML;
  }
  //console.log('answers', out);
  return out;
}

function Assignment(props) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleReject = async () => {
    let res = await fetch(
      `/api/mturk/assignments/${props.assignment.AssignmentId}/reject?${
        props.sandbox ? 'sandbox=1' : ''
      }`,
      {
        method: 'POST',
      }
    );
    res = await res.json();
    console.log('reject HIT response', res);
    if (res.TurkErrorCode) {
      window.alert('Error: ' + res.message);
      return;
    }
    handleClose();
    navigate(0);
  };
  const handleApprove = async () => {
    let res = await fetch(
      `/api/mturk/assignments/${props.assignment.AssignmentId}/approve?${
        props.sandbox ? 'sandbox=1' : ''
      }`,
      {
        method: 'POST',
      }
    );
    res = await res.json();
    console.log('approve HIT response', res);
    if (res.TurkErrorCode) {
      window.alert('Error: ' + res.message);
      return;
    }
    handleClose();
    navigate(0);
  };
  let approvable = ['Submitted', 'Rejected'].includes(
    props.assignment.AssignmentStatus
  );
  let rejectable = props.assignment.AssignmentStatus == 'Submitted';
  let answer = parseAnswer(props.assignment.Answer);
  const acceptDate = new Date(Date.parse(props.assignment.AcceptTime))
    .toString()
    .slice(4, 21);
  const timeTakenMs =
    Date.parse(props.assignment.SubmitTime || new Date()) -
    Date.parse(props.assignment.AcceptTime);
  const timeTakenMins = Math.floor(timeTakenMs / 60000);
  const timeTakenSecs = (timeTakenMs % 60000) / 1000;
  const timeTaken = `${timeTakenMins}:${timeTakenSecs}`;

  return (
    <TableRow>
      <TableCell>
        <IconButton size="small" onClick={handleClick}>
          <MoreVert />
        </IconButton>
        <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
          <MenuItem
            onClick={handleApprove}
            disabled={!approvable}
            sx={{ color: 'green' }}>
            Approve
          </MenuItem>
          <MenuItem
            onClick={handleReject}
            disabled={!rejectable}
            sx={{ color: 'red' }}>
            Reject
          </MenuItem>
        </Menu>
      </TableCell>
      <TableCell scope="row">{props.assignment.WorkerId}</TableCell>
      <TableCell align="right">{props.assignment.AssignmentStatus}</TableCell>
      <TableCell align="right">{acceptDate}</TableCell>
      <TableCell align="right">{timeTaken}</TableCell>
      <TableCell align="right">{answer.completionCode}</TableCell>
      <TableCell align="right">{'TODO'}</TableCell>
    </TableRow>
  );
}

function AssignmentTable(props) {
  return (
    <TableContainer component={Paper}>
      <Table size="small" sx={{ whiteSpace: 'nowrap' }}>
        <TableHead>
          <TableRow>
            <TableCell></TableCell>
            <TableCell>Worker ID</TableCell>
            <TableCell align="right">Status</TableCell>
            <TableCell align="right">Started</TableCell>
            <TableCell align="right">Elapsed</TableCell>
            <TableCell align="right">Code</TableCell>
            <TableCell align="right">Confirm</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {props.assignments.map((a) => (
            <Assignment
              sandbox={props.sandbox}
              assignment={a}
              key={a.AssignmentId}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function MTurkInfo() {
  let data = useLoaderData();
  console.log('MTurkInfo loader data:', data);
  let sandbox = data.sandbox;
  //let balance = data.balance.AvailableBalance;
  //let hits = data.hits.HITs;

  let cardStyle = {
    p: 1,
    height: '100px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '1em',
  };
  let mw = 150;
  return (
    <Box sx={{ display: 'flex', flexFlow: 'column wrap' }}>
      <Grid container spacing={3}>
        <Grid item xs={3} minWidth={mw}>
          <Card sx={cardStyle}>
            <AttachMoney fontSize="large" color="darkgreen" />
            <Suspense
              fallback={
                <ThreeDots
                  height="12"
                  color="lightblue"
                  wrapperStyle={{ display: 'inline' }}
                />
              }>
              <Await resolve={data.balance}>
                {(balance) => (
                  <Typography>${balance.AvailableBalance}</Typography>
                )}
              </Await>
            </Suspense>
          </Card>
        </Grid>
        <Grid item xs={3} minWidth={mw}>
          <Card sx={cardStyle}></Card>
        </Grid>
        <Grid item xs={3} minWidth={mw}>
          <Card sx={cardStyle}></Card>
        </Grid>
        <Grid item xs={3} minWidth={mw}>
          <Card sx={cardStyle}></Card>
        </Grid>
      </Grid>
      <Typography variant="h6" sx={{ pt: 3 }}>
        HITs
      </Typography>
      <Suspense fallback={<ThreeDots color="lightblue" />}>
        <Await resolve={data.hits}>
          {(hits) => (
            <>
              <HITTable sandbox={sandbox} hits={hits.HITs} />
              <Typography variant="h6" sx={{ pt: 3 }}>
                Assignments
              </Typography>
              <AssignmentTable
                sandbox={sandbox}
                assignments={[].concat(...hits.HITs.map((h) => h.Assignments))}
              />
            </>
          )}
        </Await>
      </Suspense>
    </Box>
  );
}

export function ProlificInfo() {
  let data = useLoaderData();
  if (data.error) {
    if (data.error.error_code === 140101) {
      return <InvalidProlificToken />;
    }
  }
  console.log('prolific', data);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <Typography variant="h5">
          User:{' '}
          <Suspense
            fallback={
              <ThreeDots
                height="12"
                color="lightblue"
                wrapperStyle={{ display: 'inline' }}
              />
            }>
            <Await resolve={data.me} errorElement={<p>Error loading!</p>}>
              {(me) => <span>{me.email}</span>}
            </Await>
          </Suspense>
        </Typography>
      </div>

      <Typography variant="h6" sx={{ pt: 3 }}>
        Workspaces
      </Typography>
      <Suspense fallback={<ThreeDots color="lightblue" />}>
        <Await resolve={data.workspaces} errorElement={<p>Error loading!</p>}>
          {(workspaces) => (
            <MenuList>
              {workspaces.results.map((w) => (
                <MenuItem component={Link} key={w.id} to={`/prolific/${w.id}`}>
                  {w.title}
                </MenuItem>
              ))}
            </MenuList>
          )}
          {/* <Outlet /> */}
        </Await>
      </Suspense>
      <Outlet />
    </>
  );
}

export function ProlificWorkspace(props) {
  let data = useLoaderData();
  console.log('prolificWorkspace', data);

  return (
    <Typography variant="h6">
      Projects
      <Suspense fallback={<ThreeDots color="lightblue" />}>
        <Await resolve={data.workspace} errorElement={<p>Error loading!</p>}>
          {(workspace) => (
            <MenuList>
              {workspace.projects?.map((x) => (
                <MenuItem key={x.id}>{x.title}</MenuItem>
              ))}
            </MenuList>
          )}
        </Await>
      </Suspense>
    </Typography>
  );
}

function InvalidProlificToken(props) {
  return (
    <>
      <Typography variant="h6">
        Error: Your Prolific authentication token was invalid!
      </Typography>
      <Typography>
        You probably need to create the required <i>credentials.json</i> file.
        <br />
        1. Prolific web app &gt; Settings &gt; Go to API Token page
        <br />
        2. Save your API token in a plain text file at
        <i>~/.prolific/credentials.json</i>
      </Typography>
    </>
  );
}

export function FirebaseInfo() {
  let data = useLoaderData();
  console.log('FirebaseInfo loader data:', data);

  return (
    <>
      <Typography variant="h6">Firebase Projects</Typography>
      <Suspense fallback={<ThreeDots color="lightblue" />}>
        <Await resolve={data.projects} errorElement={<p>Error loading!</p>}>
          {(projects) => (
            <MenuList>
              {projects.map((p, i) => (
                <MenuItem component={Link} key={p.projectId}>
                  {p.projectId}
                </MenuItem>
              ))}
            </MenuList>
          )}
          {/* <Outlet /> */}
        </Await>
      </Suspense>
    </>
  );
}

export default function App() {
  const navigate = useNavigate();

  return (
    <div className="App">
      <Box sx={{ display: 'flex' }}>
        <AppBar>
          <Toolbar>
            <IconButton onClick={() => navigate(-1)}>
              <ArrowBack
                sx={{
                  color: 'white',
                }}
              />
            </IconButton>
            <Typography variant="h6" noWrap component="div" margin="auto">
              Ouvrai
            </Typography>
          </Toolbar>
        </AppBar>
        <Box component="nav" sx={{ width: drawerWidth, zIndex: 1000 }}>
          <Drawer
            variant="permanent"
            sx={{
              display: 'block',
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                elevation: 3,
              },
            }}>
            <Toolbar />
            <Divider />
            <AppMenu />
          </Drawer>
        </Box>
        <Box
          component="main"
          sx={{
            height: '100vh',
            width: `calc(100% - ${drawerWidth}px)`,
            pt: 5,
            pl: 1,
          }}>
          <Toolbar />
          <Container>
            <Outlet />
          </Container>
        </Box>
      </Box>
    </div>
  );
}
