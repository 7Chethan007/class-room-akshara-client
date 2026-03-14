import ClassroomNavbar from '../../components/ClassroomNavbar/ClassroomNavbar';
import PresenterTile from '../../components/PresenterTile/PresenterTile';
import StudentTiles from '../../components/StudentTiles/StudentTiles';
import ParticipantsPanel from '../../components/ParticipantsPanel/ParticipantsPanel';
import ControlsBar from '../../components/ControlsBar/ControlsBar';
import './ClassroomPage.css';

/**
 * ClassroomPage — full-viewport dark-themed live class view
 *
 * Layout (flex column, 100vh):
 *   ├── ClassroomNavbar      ~44px
 *   ├── main                 flex: 1
 *   │   ├── VideoArea (70%)
 *   │   │   ├── PresenterTile
 *   │   │   └── StudentTiles
 *   │   └── ParticipantsPanel (30%)
 *   └── ControlsBar          ~56px
 */
function ClassroomPage() {
  return (
    <div className="classroom-page theme-dark">
      <ClassroomNavbar />

      <main className="classroom-main">
        <div className="video-area">
          <PresenterTile />
          <StudentTiles />
        </div>
        <ParticipantsPanel />
      </main>

      <ControlsBar />
    </div>
  );
}

export default ClassroomPage;
